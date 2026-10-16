// A tiny in-memory stand-in for the Mongoose models, enough for the API tests.
const { Types } = require('mongoose');

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

const matches = (doc, query = {}) => Object.entries(query).every(([key, cond]) => {
  const value = get(doc, key);
  if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond) && !(cond instanceof Types.ObjectId)) {
    if ('$lte' in cond && !(value <= cond.$lte)) return false;
    if ('$gte' in cond && !(value >= cond.$gte)) return false;
    if ('$in' in cond && !cond.$in.map(String).includes(String(value))) return false;
    if ('$exists' in cond && (value !== undefined) !== cond.$exists) return false;
    return true;
  }
  return String(value) === String(cond);
});

const project = (doc, projection) => {
  const copy = structuredClone(doc);
  if (!projection) return copy;
  if (projection['image.data'] === 0 && copy.image) delete copy.image.data;
  if (projection.image === 0) delete copy.image;
  return copy;
};

class Query {
  constructor(results) { this.results = results; }
  sort(spec) {
    const [[key, dir]] = Object.entries(spec);
    this.results = [...this.results].sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0));
    return this;
  }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.results).then(resolve, reject); }
}

const makeModel = (defaults = {}) => {
  const docs = [];
  const byId = (id) => docs.find((d) => String(d._id) === String(id));
  return {
    docs,
    find: (query, projection) => new Query(docs.filter((d) => matches(d, query)).map((d) => project(d, projection))),
    findOne: (query) => {
      const q = new Query(docs.filter((d) => matches(d, query)));
      const first = { sort: (s) => ({ then: (res, rej) => q.sort(s).then((r) => r[0] || null).then(res, rej) }) };
      return first;
    },
    findById: async (id, projection) => (byId(id) ? project(byId(id), projection) : null),
    exists: async (query) => (docs.some((d) => matches(d, query)) ? { _id: query._id } : null),
    create: async (value) => {
      const doc = { ...structuredClone(defaults), ...value, _id: new Types.ObjectId().toHexString(), createdAt: new Date() };
      docs.push(doc);
      return structuredClone(doc);
    },
    findByIdAndUpdate: async (id, update, options = {}) => {
      const doc = byId(id);
      if (!doc) return null;
      const ops = update.$set || update.$inc || update.$unset ? update : { $set: update };
      Object.assign(doc, ops.$set || {});
      Object.entries(ops.$inc || {}).forEach(([k, v]) => { doc[k] = (doc[k] || 0) + v; });
      Object.keys(ops.$unset || {}).forEach((k) => delete doc[k]);
      return project(doc, options.projection);
    },
    findByIdAndDelete: async (id) => {
      const i = docs.findIndex((d) => String(d._id) === String(id));
      if (i >= 0) docs.splice(i, 1);
    },
    deleteMany: async (query) => {
      for (let i = docs.length - 1; i >= 0; i--) if (matches(docs[i], query)) docs.splice(i, 1);
    },
    updateOne: async (query, update, { upsert } = {}) => {
      let doc = docs.find((d) => matches(d, query));
      if (!doc && upsert) { doc = { ...structuredClone(defaults), ...query, _id: new Types.ObjectId().toHexString() }; docs.push(doc); }
      if (doc) Object.entries(update.$inc || {}).forEach(([k, v]) => { doc[k] = (doc[k] || 0) + v; });
    },
    // only the $group used for sponsor totals
    aggregate: async () => {
      const totals = new Map();
      docs.forEach((d) => {
        const t = totals.get(String(d.sponsorId)) || { _id: d.sponsorId, impressions: 0, clicks: 0 };
        t.impressions += d.impressions || 0; t.clicks += d.clicks || 0;
        totals.set(String(d.sponsorId), t);
      });
      return [...totals.values()];
    },
  };
};

const makeModels = () => ({
  Article: makeModel({ status: 'pending' }),
  Sponsor: makeModel({ text: '', ctaLabel: '', allSpots: false, regions: [], spotIds: [], active: true, priority: 0, imageVersion: 0 }),
  SponsorStat: makeModel({ impressions: 0, clicks: 0 }),
});

module.exports = { makeModels };
