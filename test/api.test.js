const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { makeModels } = require('./fakeModels');

const PASSWORD = 'test-password';
const auth = { Authorization: `Bearer ${PASSWORD}` };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const day = 86400000;

let models;
let app;
beforeEach(() => {
  models = makeModels();
  app = createApp(models, { adminPassword: PASSWORD });
});

const sponsorBody = (overrides = {}) => ({
  app: 'us', advertiser: 'Trestles Surf Shop', title: 'Board rentals at Trestles', text: '10% off with code JUSTSURF',
  ctaLabel: 'Book now', linkUrl: 'https://example.com/shop', spotIds: ['ca_sd_1'],
  startDate: new Date(Date.now() - day).toISOString(), endDate: new Date(Date.now() + 30 * day).toISOString(),
  ...overrides,
});

test('admin API needs the password', async () => {
  await request(app).get('/api/admin/sponsors').expect(401);
  await request(app).get('/api/admin/sponsors').set({ Authorization: 'Bearer nope' }).expect(401);
  await request(app).get('/api/admin/articles/pending').expect(401);
  await request(app).get('/api/admin/sponsors').set(auth).expect(200);
});

test('admin is closed when no password is configured', async () => {
  const closed = createApp(makeModels(), {});
  const saved = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  await request(closed).get('/api/admin/sponsors').set({ Authorization: 'Bearer ' }).expect(503);
  if (saved) process.env.ADMIN_PASSWORD = saved;
});

test('create a sponsor and the app receives it', async () => {
  const created = await request(app).post('/api/admin/sponsors').set(auth).send(sponsorBody({ image: PNG })).expect(201);
  assert.equal(created.body.hasImage, true);
  assert.equal(created.body.image, undefined); // no image bytes in admin responses

  const res = await request(app).get('/api/sponsors?app=us').expect(200);
  assert.equal(res.body.sponsors.length, 1);
  const s = res.body.sponsors[0];
  assert.equal(s.title, 'Board rentals at Trestles');
  assert.deepEqual(s.spotIds, ['ca_sd_1']);
  assert.match(s.imageUrl, /\/api\/sponsors\/[0-9a-f]+\/image\?v=1$/);
  assert.equal(s.advertiser, undefined);

  const img = await request(app).get(new URL(s.imageUrl).pathname).expect(200);
  assert.equal(img.headers['content-type'], 'image/png');

  // the other app does not get it
  const il = await request(app).get('/api/sponsors?app=il').expect(200);
  assert.equal(il.body.sponsors.length, 0);
});

test('only live sponsors are sent to the app', async () => {
  await request(app).post('/api/admin/sponsors').set(auth).send(sponsorBody({ title: 'future', startDate: new Date(Date.now() + day).toISOString() })).expect(201);
  await request(app).post('/api/admin/sponsors').set(auth).send(sponsorBody({ title: 'ended', startDate: new Date(Date.now() - 9 * day).toISOString(), endDate: new Date(Date.now() - day).toISOString() })).expect(201);
  await request(app).post('/api/admin/sponsors').set(auth).send(sponsorBody({ title: 'paused', active: false })).expect(201);
  await request(app).post('/api/admin/sponsors').set(auth).send(sponsorBody({ title: 'live' })).expect(201);
  const res = await request(app).get('/api/sponsors?app=us').expect(200);
  assert.deepEqual(res.body.sponsors.map((s) => s.title), ['live']);
});

test('invalid input is rejected with clear errors', async () => {
  const res = await request(app).post('/api/admin/sponsors').set(auth)
    .send(sponsorBody({ linkUrl: 'javascript:alert(1)', spotIds: [], title: '' })).expect(400);
  assert.ok(res.body.errors.some((e) => e.includes('linkUrl')));
  assert.ok(res.body.errors.some((e) => e.includes('title')));
  assert.ok(res.body.errors.some((e) => e.includes('where to show')));
  await request(app).post('/api/admin/sponsors').set(auth).send(sponsorBody({ image: 'data:text/html;base64,PGgxPg==' })).expect(400);
});

test('impressions and clicks are counted per day', async () => {
  const { body } = await request(app).post('/api/admin/sponsors').set(auth).send(sponsorBody()).expect(201);
  await request(app).post(`/api/sponsors/${body.id}/events`).send({ type: 'impression' }).expect(204);
  await request(app).post(`/api/sponsors/${body.id}/events`).send({ type: 'impression' }).expect(204);
  await request(app).post(`/api/sponsors/${body.id}/events`).send({ type: 'click' }).expect(204);
  await request(app).post(`/api/sponsors/${body.id}/events`).send({ type: 'hack' }).expect(400);
  await request(app).post('/api/sponsors/64b7f0000000000000000000/events').send({ type: 'click' }).expect(404);

  const list = await request(app).get('/api/admin/sponsors').set(auth).expect(200);
  assert.equal(list.body[0].impressions, 2);
  assert.equal(list.body[0].clicks, 1);
  const stats = await request(app).get(`/api/admin/sponsors/${body.id}/stats`).set(auth).expect(200);
  assert.equal(stats.body.length, 1);
  assert.equal(stats.body[0].impressions, 2);
});

test('update bumps the image version so apps reload the new image', async () => {
  const { body } = await request(app).post('/api/admin/sponsors').set(auth).send(sponsorBody({ image: PNG })).expect(201);
  const updated = await request(app).put(`/api/admin/sponsors/${body.id}`).set(auth).send({ title: 'New title', image: PNG }).expect(200);
  assert.equal(updated.body.title, 'New title');
  assert.equal(updated.body.imageVersion, 2);
  const removed = await request(app).put(`/api/admin/sponsors/${body.id}`).set(auth).send({ removeImage: true }).expect(200);
  assert.equal(removed.body.hasImage, false);
});

test('delete removes the sponsor and its stats', async () => {
  const { body } = await request(app).post('/api/admin/sponsors').set(auth).send(sponsorBody()).expect(201);
  await request(app).post(`/api/sponsors/${body.id}/events`).send({ type: 'click' }).expect(204);
  await request(app).delete(`/api/admin/sponsors/${body.id}`).set(auth).expect(200);
  assert.equal(models.Sponsor.docs.length, 0);
  assert.equal(models.SponsorStat.docs.length, 0);
});

test('admin page is served', async () => {
  const res = await request(app).get('/admin/').expect(200);
  assert.match(res.text, /ניהול חסויות/);
  await request(app).get('/admin/spots-us.json').expect(200);
});

test('articles keep working', async () => {
  await models.Article.create({ title: 'A', status: 'approved', date: new Date() });
  const res = await request(app).get('/api/articles/latest').expect(200);
  assert.equal(res.body.title, 'A');
});
