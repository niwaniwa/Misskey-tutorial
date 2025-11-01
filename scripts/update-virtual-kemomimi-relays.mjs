#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SOURCE_URL = 'https://relay.virtualkemomimi.net/';
const DATA_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/data/virtual-kemomimi-servers.json');
const ENDPOINTS = [
  'https://relay.virtualkemomimi.net/api/relays.json',
  'https://relay.virtualkemomimi.net/api/relays',
  'https://relay.virtualkemomimi.net/relays.json',
  'https://relay.virtualkemomimi.net/api/servers',
  'https://relay.virtualkemomimi.net/index.json'
];

const boolish = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (['true', 'yes', 'open', '1', 'y'].includes(normalized)) return true;
    if (['false', 'no', 'closed', '0', 'n'].includes(normalized)) return false;
  }
  return null;
};

const toArray = (value) => {
  if (!value && value !== 0) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : typeof item === 'number' ? String(item) : ''))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[、,\/\|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const unique = (array) => {
  return Array.from(new Set(array.filter(Boolean)));
};

const pickFirstString = (...candidates) => {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const nested = pickFirstString(...candidate);
      if (nested) return nested;
    } else if (candidate && typeof candidate === 'object') {
      continue;
    } else if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
  }
  return '';
};

const ensureUrl = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed.replace(/^\/*/, '')}`;
};

const slugify = (value) => {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const date = new Date(trimmed);
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  return null;
};

const formatDate = (date) => {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
};

const determineRegistrationStatus = (entry) => {
  if (!entry) return 'open';
  if (typeof entry.registrationStatus === 'string') {
    const normalized = entry.registrationStatus.trim().toLowerCase();
    if (['open', '募集中', 'accepting', 'active'].includes(normalized)) return 'open';
    if (['closed', '停止', 'archived', 'full'].includes(normalized)) return 'closed';
  }
  const flags = [
    entry.registrationOpen,
    entry.openRegistration,
    entry.acceptingApplications,
    entry.applicationsOpen,
    entry.isOpen,
    entry.isAccepting,
    entry.open
  ];
  for (const flag of flags) {
    const bool = boolish(flag);
    if (bool !== null) {
      return bool ? 'open' : 'closed';
    }
  }
  return 'open';
};

const determineAccessType = (entry) => {
  const invitationFlags = [
    entry.accessType,
    entry.inviteOnly,
    entry.isInviteOnly,
    entry.requiresInvitation,
    entry.requiresInvite,
    entry.invitationRequired,
    entry.invitation,
    entry.joinPolicy,
    entry.reviewType
  ];
  for (const flag of invitationFlags) {
    if (typeof flag === 'string') {
      const normalized = flag.trim().toLowerCase();
      if (['invite', 'invited', 'invite-only', 'invitation', 'code', '招待', 'コード'].some((keyword) => normalized.includes(keyword))) {
        return 'invite';
      }
      if (['open', 'anyone', 'instant', 'free'].some((keyword) => normalized.includes(keyword))) {
        return 'open';
      }
    } else {
      const bool = boolish(flag);
      if (bool !== null) {
        return bool ? 'invite' : 'open';
      }
    }
  }
  return 'invite';
};

const joinText = (value) => {
  if (!value) return '';
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(' / ');
  }
  if (typeof value === 'string') return value;
  return '';
};

const normaliseEntry = (entry, index) => {
  if (!entry || typeof entry !== 'object') return null;
  const urlCandidate = pickFirstString(entry.url, entry.website, entry.homepage, entry.host, entry.domain, entry.instance, entry.address);
  const url = ensureUrl(urlCandidate);
  const name = pickFirstString(entry.name, entry.title, entry.instanceName, entry.displayName, entry.host, entry.domain, entry.url);
  if (!name) return null;
  const theme = pickFirstString(entry.theme, entry.focus, entry.category, entry.categories && joinText(entry.categories), entry.summaryTitle, entry.topic, 'テーマ未掲載');
  const languages = unique([
    ...toArray(entry.languages),
    ...toArray(entry.language),
    ...toArray(entry.lang),
    ...toArray(entry.locales)
  ]);
  const description = pickFirstString(entry.description, entry.summary, entry.about, '詳細は公式募集ページでご確認ください。');
  const highlightText = pickFirstString(entry.highlights, joinText(entry.features), entry.notes, '募集要項やイベント情報はリンク先で確認できます。');
  const tagCandidates = [
    ...toArray(entry.tags),
    ...toArray(entry.topics),
    ...toArray(entry.categories),
    theme ? [theme] : [],
    entry.focus ? [entry.focus] : []
  ];
  const tags = unique(tagCandidates.flat());
  const monthlyRelaySlot = pickFirstString(entry.monthlyRelaySlot, entry.relaySlot, entry.slot, entry.recruitmentWindow, entry.applicationWindow, entry.window, '募集枠を公式で確認');
  const reviewDate = parseDate(entry.lastReviewed) || parseDate(entry.updatedAt) || parseDate(entry.checkedAt) || parseDate(entry.lastChecked) || parseDate(entry.lastUpdated) || parseDate(entry.publishedAt) || parseDate(entry.createdAt) || new Date();

  const registrationStatus = determineRegistrationStatus(entry);
  const accessType = determineAccessType(entry);

  let hostSlug = '';
  if (url) {
    try {
      hostSlug = slugify(new URL(url).hostname);
    } catch (error) {
      hostSlug = '';
    }
  }
  const idCandidate = pickFirstString(entry.id, entry.slug, hostSlug, slugify(name));
  const id = idCandidate || `server-${index + 1}`;

  return {
    id,
    name,
    url: url || SOURCE_URL,
    theme,
    languages: languages.length > 0 ? languages : ['情報未掲載'],
    description,
    highlights: highlightText,
    tags,
    registrationStatus,
    accessType,
    monthlyRelaySlot,
    lastReviewed: formatDate(reviewDate)
  };
};

const collator = new Intl.Collator('ja');

const fetchRelayData = async () => {
  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          'Accept': 'application/json, text/plain;q=0.8,*/*;q=0.5',
          'User-Agent': 'Misskey-Compass-Relay-Fetcher/1.0 (+https://github.com/misskey-compass/Misskey-tutorial)'
        }
      });
      if (!response.ok) {
        console.warn(`Request to ${endpoint} returned status ${response.status}`);
        continue;
      }
      const contentType = response.headers.get('content-type') || '';
      if (!/application\/json|text\/json/i.test(contentType)) {
        console.warn(`Skipping ${endpoint} because of unsupported content-type: ${contentType}`);
        continue;
      }
      const body = await response.json();
      if (body) {
        return body;
      }
    } catch (error) {
      console.warn(`Failed to fetch ${endpoint}:`, error.message || error);
    }
  }
  return null;
};

const extractServerEntries = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.relays)) return payload.relays;
  if (Array.isArray(payload.servers)) return payload.servers;
  if (Array.isArray(payload.data)) return payload.data;
  if (typeof payload === 'object') {
    const firstArray = Object.values(payload).find((value) => Array.isArray(value));
    if (Array.isArray(firstArray)) return firstArray;
  }
  return [];
};

const main = async () => {
  const payload = await fetchRelayData();
  if (!payload) {
    console.warn('No data retrieved from Virtual Kemomimi Relay. Keeping existing dataset.');
    return;
  }

  const entries = extractServerEntries(payload);
  if (entries.length === 0) {
    console.warn('Fetched payload did not contain relay entries. Keeping existing dataset.');
    return;
  }

  const normalized = entries
    .map((entry, index) => {
      try {
        return normaliseEntry(entry, index);
      } catch (error) {
        console.warn('Failed to normalise entry:', error.message || error);
        return null;
      }
    })
    .filter(Boolean);

  if (normalized.length === 0) {
    console.warn('Normalised relay list is empty. Keeping existing dataset.');
    return;
  }

  const sorted = normalized.sort((a, b) => collator.compare(a.name, b.name));
  const document = {
    updatedAt: formatDate(new Date()),
    source: 'Virtual Kemomimi Relay',
    sourceUrl: SOURCE_URL,
    servers: sorted
  };

  const nextContent = `${JSON.stringify(document, null, 2)}\n`;
  let previousContent = '';
  try {
    previousContent = await readFile(DATA_PATH, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Could not read existing dataset:', error.message || error);
    }
  }

  if (previousContent === nextContent) {
    console.log('Relay dataset is already up to date.');
    return;
  }

  await writeFile(DATA_PATH, nextContent, 'utf8');
  console.log(`Relay dataset updated with ${sorted.length} entries.`);
};

main().catch((error) => {
  console.error('Unexpected error while updating relay dataset:', error);
  process.exitCode = 1;
});
