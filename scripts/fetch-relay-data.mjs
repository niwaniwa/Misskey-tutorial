#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const ENDPOINTS = [
  'https://relay.virtualkemomimi.net/api/relay.json',
  'https://relay.virtualkemomimi.net/relay.json',
  'https://relay.virtualkemomimi.net/api/instances.json',
  'https://relay.virtualkemomimi.net/api/relays.json',
  'https://relay.virtualkemomimi.net/api/instances',
  'https://relay.virtualkemomimi.net/'
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_PATH = path.resolve(__dirname, '../assets/data/virtual-kemomimi-servers.json');

const DATE_PATTERN = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/;

async function fetchEndpoint(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Misskey-Compass-Bot/1.0 (+https://github.com/misskey-compass)',
      Accept: 'application/json,text/html;q=0.9,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await response.json();
  }

  const text = await response.text();
  const candidates = extractJsonCandidates(text);
  if (candidates.length === 0) {
    throw new Error(`No JSON candidates discovered in HTML response from ${url}`);
  }

  return candidates[0];
}

function extractJsonCandidates(text) {
  const candidates = [];
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(text)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;

    const cleaned = raw
      .replace(/^\s*window\.[A-Za-z0-9_$.]+\s*=\s*/u, '')
      .replace(/^\s*const\s+[A-Za-z0-9_$]+\s*=\s*/u, '')
      .replace(/^\s*var\s+[A-Za-z0-9_$]+\s*=\s*/u, '')
      .replace(/^\s*let\s+[A-Za-z0-9_$]+\s*=\s*/u, '')
      .replace(/;\s*$/u, '')
      .trim();

    if (!cleaned) continue;

    try {
      candidates.push(JSON.parse(cleaned));
    } catch (error) {
      // ignore non-JSON script content
    }
  }

  return candidates;
}

function findServerArray(payload, depth = 0) {
  if (depth > 6 || payload == null) {
    return null;
  }

  if (Array.isArray(payload)) {
    const hasServerLikeObject = payload.some(
      (item) => item && typeof item === 'object' && (item.url || item.host || item.instance || item.domain)
    );
    return hasServerLikeObject ? payload : null;
  }

  if (typeof payload !== 'object') {
    return null;
  }

  const prioritizedKeys = ['servers', 'instances', 'items', 'data', 'result', 'relays', 'list'];
  for (const key of prioritizedKeys) {
    if (key in payload) {
      const candidate = findServerArray(payload[key], depth + 1);
      if (candidate) return candidate;
    }
  }

  for (const value of Object.values(payload)) {
    const candidate = findServerArray(value, depth + 1);
    if (candidate) return candidate;
  }

  return null;
}

function findUpdatedAt(payload, depth = 0) {
  if (depth > 6 || payload == null) return null;

  if (typeof payload === 'string') {
    const normalized = normalizeDate(payload);
    if (normalized) return normalized;
    return null;
  }

  if (typeof payload === 'number') {
    return normalizeDate(payload);
  }

  if (typeof payload !== 'object') return null;

  const directKeys = ['updatedAt', 'updated_at', 'lastUpdated', 'last_checked', 'lastChecked'];
  for (const key of directKeys) {
    if (payload[key]) {
      const normalized = normalizeDate(payload[key]);
      if (normalized) return normalized;
    }
  }

  for (const value of Object.values(payload)) {
    const nested = findUpdatedAt(value, depth + 1);
    if (nested) return nested;
  }

  return null;
}

function normalizeDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = trimmed.match(DATE_PATTERN);
    if (match) {
      const [, year, month, day] = match;
      const isoDate = new Date(Number(year), Number(month) - 1, Number(day));
      if (!Number.isNaN(isoDate.getTime())) {
        return isoDate.toISOString().slice(0, 10);
      }
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return null;
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,、/\n]/u)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [String(value).trim()].filter((item) => item.length > 0);
}

function normalizeText(value) {
  if (!value) return '';
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).join('／');
  }
  if (typeof value === 'object') {
    return Object.values(value)
      .map((item) => String(item).trim())
      .filter(Boolean)
      .join('／');
  }
  return String(value).trim();
}

function determineRegistrationStatus(record) {
  const candidates = [
    record.registrationStatus,
    record.status,
    record.open,
    record.openRegistrations,
    record.open_registration,
    record.acceptingRegistrations,
    record.isAccepting,
    record.joinable,
    record.active,
    record.isOpen,
    record.opened,
    record.join_status,
    record.joinStatus
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'boolean') {
      return candidate ? 'open' : 'closed';
    }
    if (typeof candidate === 'string') {
      if (/open|accept|募集|available|true/i.test(candidate)) {
        return 'open';
      }
      if (/close|stop|pause|満員|false/i.test(candidate)) {
        return 'closed';
      }
    }
  }

  return 'open';
}

function determineAccessType(record, isOpen) {
  const candidates = [
    record.accessType,
    record.inviteType,
    record.invitation,
    record.registration,
    record.registrationMethod,
    record.registration_method,
    record.registration_mode,
    record.joinMethod,
    record.access,
    record.inviteOnly,
    record.requiresInvite,
    record.requireInvite,
    record.invite_required,
    record.joinPolicy,
    record.join_policy
  ];

  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (typeof candidate === 'boolean') {
      return candidate ? 'invite' : 'open';
    }
    const text = normalizeText(candidate).toLowerCase();
    if (!text) continue;
    if (/invite|コード|approval|manual|closed|application|審査/u.test(text)) {
      return 'invite';
    }
    if (/open|public|instant|auto|自由/u.test(text)) {
      return 'open';
    }
  }

  const tagHints = toArray(record.tags || record.keywords).join(' ').toLowerCase();
  if (/invite|コード|approval|招待/u.test(tagHints)) {
    return 'invite';
  }

  return isOpen ? 'open' : 'invite';
}

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return '';
}

function normalizeServer(record) {
  const urlCandidate = record.url || record.website || record.uri || record.instance || record.host || record.domain;
  if (!urlCandidate) return null;

  let url;
  try {
    url = new URL(urlCandidate.startsWith('http') ? urlCandidate : `https://${urlCandidate}`);
  } catch (error) {
    return null;
  }

  const id = normalizeText(record.id) || url.hostname.replace(/[^a-z0-9-]/gi, '-');
  const name = pickFirstNonEmpty(record.name, record.title, record.instanceName, url.hostname);
  const theme = pickFirstNonEmpty(record.theme, record.category, record.categories, record.topics, '未設定');
  const languages = toArray(record.languages || record.language || record.lang);
  const description = pickFirstNonEmpty(record.description, record.summary, record.shortDescription, record.about);
  const highlights = pickFirstNonEmpty(record.highlights, record.features, record.special, record.notesHighlight);
  const tags = Array.from(new Set(toArray(record.tags || record.keywords || record.labels)));
  const registrationStatus = determineRegistrationStatus(record);
  const accessType = determineAccessType(record, registrationStatus === 'open');
  const monthlyRelaySlot = pickFirstNonEmpty(
    record.monthlyRelaySlot,
    record.relaySlot,
    record.slot,
    record.schedule,
    registrationStatus === 'open' ? '募集枠はリンク先で確認' : ''
  );
  const accessNote = pickFirstNonEmpty(
    record.accessNote,
    record.inviteNote,
    record.inviteDetail,
    record.registrationNote,
    record.joinNote,
    record.notes && typeof record.notes === 'string' ? record.notes : ''
  );
  const lastReviewed = normalizeDate(
    record.lastReviewed ||
      record.lastChecked ||
      record.checkedAt ||
      record.updatedAt ||
      record.updated_at ||
      record.last_seen ||
      record.lastSeen
  );

  const server = {
    id,
    name,
    url: url.toString(),
    theme,
    languages,
    description,
    highlights,
    tags,
    registrationStatus,
    accessType,
    monthlyRelaySlot: monthlyRelaySlot || '募集枠はリンク先で確認',
    lastReviewed: lastReviewed || new Date().toISOString().slice(0, 10)
  };

  if (accessNote) {
    server.accessNote = accessNote;
  }

  return server;
}

async function main() {
  let payload;
  let usedEndpoint = null;
  for (const endpoint of ENDPOINTS) {
    try {
      const data = await fetchEndpoint(endpoint);
      const serverArray = findServerArray(data);
      if (!serverArray) {
        continue;
      }
      payload = { root: data, servers: serverArray };
      usedEndpoint = endpoint;
      break;
    } catch (error) {
      console.warn(`[fetch-relay-data] ${endpoint}: ${error.message}`);
    }
  }

  if (!payload || !payload.servers) {
    console.error('Unable to locate relay server data from any endpoint.');
    process.exit(1);
  }

  const normalizedServers = payload.servers
    .map((server) => normalizeServer(server))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  if (normalizedServers.length === 0) {
    console.error('No valid server entries were produced from the fetched data.');
    process.exit(1);
  }

  const updatedAt =
    findUpdatedAt(payload.root) || new Date().toISOString().slice(0, 10);

  const dataset = {
    updatedAt,
    source: `Virtual Kemomimi Relay (${usedEndpoint})`,
    servers: normalizedServers
  };

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  console.log(`Relay dataset updated with ${normalizedServers.length} entries from ${usedEndpoint}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
