'use strict';

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const FIXTURES_PATH = path.join(__dirname, '..', 'fixtures', 'seed-data.json');
const SAMPLE_IMAGE_PATH = path.join(__dirname, '..', 'fixtures', 'sample.jpg');

let _fixtures = null;
let _imageBuffer = null;
let _voterIndex = 0;
let _vuCounter = 0;

function getFixtures() {
  if (!_fixtures) {
    if (!fs.existsSync(FIXTURES_PATH)) {
      throw new Error(
        'fixtures/seed-data.json not found.\n' +
        'Run `npm run perf` (or the fetch-fixtures script) first.'
      );
    }
    _fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
  }
  return _fixtures;
}

function getImageBuffer() {
  if (!_imageBuffer) {
    _imageBuffer = fs.readFileSync(SAMPLE_IMAGE_PATH);
  }
  return _imageBuffer;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Pre-generate voter key pool — each VU gets a unique key so the 30/min
// rate limit (keyed by voterKey when body is parsed, IP otherwise) is
// never triggered. Pool size > max VUs across all phases.
const VOTER_POOL = Array.from(
  { length: 2500 },
  (_, i) => `perf-voter-${String(i).padStart(5, '0')}-${Date.now()}`
);

// Each VU gets its own unique fake IP — one VU = one visitor = one IP.
// This prevents any shared rate-limit bucket across VUs, so no 429s can
// accumulate even if the keyGenerator falls back to req.ip (e.g. the vote
// endpoint's voterKey fallback when body parsing is unavailable).
// spoofedIp supports up to 256*256 = 65536 unique addresses; well above
// any realistic VU count.
// trustProxy: true means Fastify honours X-Forwarded-For for request.ip.
function spoofedIp(vuIndex) {
  return `10.1.${Math.floor(vuIndex / 256) % 256}.${vuIndex % 256}`;
}

// beforeScenario hook used by browse.yml
module.exports.setVars = function setVars(userContext, events, done) {
  const data = getFixtures();
  userContext.vars.slug = pick(data.slugs);
  userContext.vars.token = pick(data.tokens);
  userContext.vars.entryNumber = pick(data.entryNumbers);
  userContext.vars.vehicleId = pick(data.vehicleIds);
  userContext.vars.voterKey = VOTER_POOL[_voterIndex++ % VOTER_POOL.length];
  userContext.vars._vuIndex = _vuCounter++;
  return done();
};

// beforeScenario hook used by vote.yml
module.exports.setVoteVars = function setVoteVars(userContext, events, done) {
  const data = getFixtures();
  userContext.vars.vehicleId = pick(data.vehicleIds);
  userContext.vars.voterKey = VOTER_POOL[_voterIndex++ % VOTER_POOL.length];
  userContext.vars._vuIndex = _vuCounter++;
  return done();
};

// beforeRequest hook used by vote.yml — sets a unique X-Forwarded-For per VU
// so that, if the voterKey body fallback is ever triggered, each VU still has
// its own IP bucket and cannot share rate-limit state with any other VU.
module.exports.setVoteRequest = function setVoteRequest(requestParams, context, events, done) {
  const ip = spoofedIp(context.vars._vuIndex || 0);
  requestParams.headers = Object.assign(requestParams.headers || {}, {
    'X-Forwarded-For': ip,
  });
  return done();
};

// beforeScenario hook used by upload.yml
module.exports.setUploadVars = function setUploadVars(userContext, events, done) {
  const data = getFixtures();
  userContext.vars.uploadToken = pick(data.tokens);
  userContext.vars._vuIndex = _vuCounter++;
  return done();
};

// beforeRequest hook for the upload POST — attaches the multipart body and
// spoofs X-Forwarded-For with a unique IP per VU so each VU has its own
// rate-limit bucket. The upload limit is 12/min per IP; with each VU making
// exactly one request, no VU can ever exhaust its own budget.
module.exports.attachMultipart = function attachMultipart(requestParams, context, events, done) {
  const form = new FormData();
  form.append('file', getImageBuffer(), {
    filename: 'sample.jpg',
    contentType: 'image/jpeg',
  });

  requestParams.headers = Object.assign(
    requestParams.headers || {},
    form.getHeaders(),
    { 'X-Forwarded-For': spoofedIp(context.vars._vuIndex || 0) }
  );
  requestParams.body = form;
  return done();
};
