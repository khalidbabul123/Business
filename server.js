import http from 'node:http';
import crypto from 'node:crypto';

const port = Number(process.env.PORT || 8787);
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:8080';
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const usingSupabase = Boolean(supabaseUrl && supabaseKey);
const localLeads = [];
const buckets = new Map();
const duplicateWindowMs = 10 * 60 * 1000;
const rateWindowMs = 60 * 60 * 1000;
const maxRequestsPerHour = 5;

if (process.env.NODE_ENV === 'production' && !usingSupabase) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in production.');
}
if (!usingSupabase) console.warn('Supabase is not configured; local submissions use in-memory storage and will not persist.');

const json = (response, status, body) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' });
  response.end(JSON.stringify(body));
};
const clean = (value, max = 2000) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const validUrl = (value) => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; } };
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

async function verifyCaptcha(token, ip) {
  if (!process.env.CAPTCHA_SECRET_KEY) return { ok: true, configured: false };
  if (!token) return { ok: false, configured: true };
  const response = await fetch(process.env.CAPTCHA_VERIFY_URL || 'https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ secret: process.env.CAPTCHA_SECRET_KEY, response: token, remoteip: ip }) });
  const result = await response.json();
  return { ok: Boolean(result.success), configured: true };
}

async function notifyOwner(lead) {
  if (!process.env.RESEND_API_KEY || !process.env.OWNER_EMAIL) return;
  const subject = `New ProbKey ${lead.source === 'free_audit' ? 'free audit' : 'contact'} lead: ${lead.business_name}`;
  const text = Object.entries(lead).map(([key, value]) => `${key}: ${value}`).join('\n');
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.EMAIL_FROM || 'ProbKey Leads <onboarding@resend.dev>', to: [process.env.OWNER_EMAIL], subject, text }) });
  if (!response.ok) console.error('Lead notification failed:', await response.text());
}

async function supabaseRequest(url, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${url}`, { ...options, headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`Supabase request failed with ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function hasRecentDuplicate(source, email, since) {
  if (!usingSupabase) return localLeads.some((lead) => lead.source === source && lead.email === email && Date.parse(lead.created_at) >= since);
  const params = new URLSearchParams({ select: 'id', source: `eq.${source}`, email: `eq.${email}`, created_at: `gte.${new Date(since).toISOString()}`, limit: '1' });
  const rows = await supabaseRequest(`leads?${params}`);
  return rows.length > 0;
}

async function saveLead(lead) {
  if (!usingSupabase) { localLeads.push(lead); return; }
  await supabaseRequest('leads', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(lead) });
}

async function handleLead(request, response) {
  const ip = request.headers['x-forwarded-for']?.split(',')[0].trim() || request.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = buckets.get(ip) || { started: now, count: 0 };
  if (now - bucket.started > rateWindowMs) { bucket.started = now; bucket.count = 0; }
  if (++bucket.count > maxRequestsPerHour) return json(response, 429, { message: 'Too many requests. Please try again later.' });
  buckets.set(ip, bucket);

  let body = '';
  for await (const chunk of request) { body += chunk; if (body.length > 20000) return json(response, 413, { message: 'Submission is too large.' }); }
  let input;
  try { input = JSON.parse(body); } catch { return json(response, 400, { message: 'Please submit valid form data.' }); }
  const source = input.source === 'free_audit' ? 'free_audit' : input.source === 'contact' ? 'contact' : '';
  const lead = { id: crypto.randomUUID(), created_at: new Date(now).toISOString(), source, name: clean(input.name, 120), business_name: clean(input.business || input.business_name, 160), email: clean(input.email, 254).toLowerCase(), phone: clean(input.phone, 40), website: clean(input.website, 500), industry: clean(input.industry, 120), social_profile: clean(input.social_profile || input.social, 500), service: clean(input.service, 100), message: clean(input.message, 4000), status: 'new' };
  if (!source || !lead.name || !lead.business_name || !lead.email || !lead.message || !validEmail(lead.email) || (source === 'free_audit' && !lead.website) || (lead.website && !validUrl(lead.website)) || (lead.social_profile && !validUrl(lead.social_profile))) return json(response, 422, { message: 'Please check the required fields and URL formats.' });
  if (input.website_url || input.url || input.company_website) return json(response, 400, { message: 'Invalid submission.' });
  if (clean(input._gotcha, 100)) return json(response, 200, { ok: true });
  const captcha = await verifyCaptcha(clean(input.captcha_token, 2000), ip);
  if (!captcha.ok) return json(response, 400, { message: 'Spam verification failed. Please try again.' });

  if (await hasRecentDuplicate(source, lead.email, now - duplicateWindowMs)) return json(response, 409, { message: 'We already received a recent submission from this email address.' });
  await saveLead(lead);
  notifyOwner(lead).catch((error) => console.error('Lead notification error:', error.message));
  return json(response, 201, { ok: true });
}

const server = http.createServer((request, response) => {
  if (request.method === 'OPTIONS') return json(response, 204, {});
  if (request.method === 'POST' && request.url === '/api/leads') return handleLead(request, response).catch((error) => { console.error('Lead API error:', error); json(response, 500, { message: 'Something went wrong. Please try again or contact us directly.' }); });
  return json(response, 404, { message: 'Not found.' });
});
server.listen(port, () => console.log(`ProbKey lead API listening on port ${port}`));
