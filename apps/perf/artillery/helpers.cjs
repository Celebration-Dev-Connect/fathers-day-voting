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
        'Run `npm run perf` (or `tsx scripts/fetch-fixtures.ts`) first.'
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
// rate limit (keyed by voterKey) is never triggered during the test.
const VOTER_POOL = Array.from(
  { length: 500 },
  (_, i) => `perf-voter-${String(i).padStart(4, '0')}-${Date.now()}`
);

// Called before each scenario in browse.yml and vote.yml
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

// Called before each scenario in upload.yml — assigns a token and VU index
module.exports.setUploadVars = function setUploadVars(userContext, events, done) {
  const data = getFixtures();
  userContext.vars.uploadToken = pick(data.tokens);
  userContext.vars._vuIndex = _vuCounter++;
  return done();
};

// beforeRequest hook for the upload POST — attaches the multipart body and
// spoofs X-Forwarded-For so each "VU group" of 20 gets its own rate-limit
// bucket (12 uploads/min/IP). Fastify reads request.ip from this header
// because the server is built with trustProxy: true.
module.exports.attachMultipart = function attachMultipart(requestParams, context, events, done) {
  const form = new FormData();
  form.append('file', getImageBuffer(), {
    filename: 'sample.jpg',
    contentType: 'image/jpeg',
  });

  const ipBucket = (context.vars._vuIndex || 0) % 20;
  Object.assign(requestParams.headers, form.getHeaders(), {
    'X-Forwarded-For': `10.0.1.${ipBucket + 1}`,
  });
  requestParams.body = form;
  return done();
};
