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

// Spread VUs across 50 fake IPs. This is the primary defence against IP-based
// rate limiting on the vote endpoint — @fastify/rate-limit's keyGenerator reads
// req.body.voterKey, but in some Fastify hook orderings the body may not be
// parsed yet when the rate-limit preHandler fires, causing a fallback to IP.
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

// beforeRequest hook used by vote.yml — rotates X-Forwarded-For across 50
// fake IPs to stay within per-IP rate-limit budget.
module.exports.setVoteRequest = function setVoteRequest(requestParams, context, events, done) {
  const ip = spoofedIp((context.vars._vuIndex || 0) % 50);
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
// spoofs X-Forwarded-For so 20 VU groups each get their own rate-limit bucket
// (12 uploads/min each = 240/min total headroom).
module.exports.attachMultipart = function attachMultipart(requestParams, context, events, done) {
  const form = new FormData();
  form.append('file', getImageBuffer(), {
    filename: 'sample.jpg',
    contentType: 'image/jpeg',
  });

  const ipBucket = (context.vars._vuIndex || 0) % 20;
  requestParams.headers = Object.assign(
    requestParams.headers || {},
    form.getHeaders(),
    { 'X-Forwarded-For': `10.0.1.${ipBucket + 1}` }
  );
  requestParams.body = form;
  return done();
};
