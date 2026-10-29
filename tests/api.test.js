/**
 * Automated Verification Suite for WasteWise Portal
 * Tests all 16 required verification scenarios end-to-end
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const mongoose = require('mongoose');

// Ensure test environment
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wastewise_test_suite';

const app = require('../server');
const User = require('../models/User');
const Pickup = require('../models/Pickup');
const RecyclingCenter = require('../models/RecyclingCenter');
const RecyclingRecord = require('../models/RecyclingRecord');

describe('WasteWise End-to-End API Test Suite', () => {
  let citizenAgent;
  let citizen2Agent;
  let collectorAgent;
  let otherCollectorAgent;
  let centerAgent;
  let otherCenterAgent;
  let adminAgent;

  let testCenterId;
  let otherCenterId;
  let testCollectorId;
  let otherCollectorId;
  let testCitizenId;
  let testPickupId;

  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    // Clean test db
    await User.deleteMany({});
    await Pickup.deleteMany({});
    await RecyclingCenter.deleteMany({});
    await RecyclingRecord.deleteMany({});

    citizenAgent = request.agent(app);
    citizen2Agent = request.agent(app);
    collectorAgent = request.agent(app);
    otherCollectorAgent = request.agent(app);
    centerAgent = request.agent(app);
    otherCenterAgent = request.agent(app);
    adminAgent = request.agent(app);
  });

  after(async () => {
    await mongoose.disconnect();
  });

  it('Scenario 1: Citizen can register, log in, and log out', async () => {
    // 1. Register
    const regRes = await citizenAgent.post('/api/auth/register').send({
      name: 'John Citizen',
      email: 'john@example.com',
      phone: '9876543210',
      password: 'Password@123',
      confirmPassword: 'Password@123',
      street: '123 Eco Way',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
    });

    assert.strictEqual(regRes.status, 201);
    assert.strictEqual(regRes.body.success, true);
    assert.strictEqual(regRes.body.user.role, 'citizen');
    testCitizenId = regRes.body.user._id;

    // 2. Check /api/auth/me while logged in
    const meRes = await citizenAgent.get('/api/auth/me');
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.body.user.email, 'john@example.com');

    // 3. Log out
    const logoutRes = await citizenAgent.post('/api/auth/logout');
    assert.strictEqual(logoutRes.status, 200);

    // 4. Log back in
    const loginRes = await citizenAgent.post('/api/auth/login').send({
      email: 'john@example.com',
      password: 'Password@123',
    });
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.body.user.name, 'John Citizen');
  });

  it('Scenario 2: Duplicate email registration is rejected', async () => {
    const dupRes = await request(app).post('/api/auth/register').send({
      name: 'Duplicate Person',
      email: 'john@example.com', // Already registered
      phone: '9876543211',
      password: 'Password@123',
      confirmPassword: 'Password@123',
    });

    assert.strictEqual(dupRes.status, 409);
    assert.strictEqual(dupRes.body.success, false);
  });

  it('Scenario 3: Incorrect login credentials are rejected', async () => {
    const badLoginRes = await request(app).post('/api/auth/login').send({
      email: 'john@example.com',
      password: 'WrongPassword!',
    });

    assert.strictEqual(badLoginRes.status, 401);
    assert.strictEqual(badLoginRes.body.success, false);
  });

  it('Scenario 4: Passwords are stored as secure bcrypt hashes', async () => {
    const rawUser = await User.findOne({ email: 'john@example.com' }).select('+password');
    assert.ok(rawUser.password.startsWith('$2'), 'Password should be a bcrypt hash string');
    assert.notStrictEqual(rawUser.password, 'Password@123');
  });

  it('Scenario 5 & 14: Citizen pickup validation & creation', async () => {
    // Test invalid pickup (missing quantity, invalid category, past date)
    const invalidRes = await citizenAgent.post('/api/pickups').send({
      wasteCategory: 'Plutonium', // Invalid category
      estimatedQuantity: -5, // Invalid negative quantity
      street: 'Eco St',
      city: 'City',
      state: 'State',
      postalCode: '123456',
      preferredDate: '2020-01-01', // Past date
    });
    assert.strictEqual(invalidRes.status, 422);
    assert.strictEqual(invalidRes.body.success, false);

    // Valid pickup creation
    const validRes = await citizenAgent.post('/api/pickups').send({
      wasteCategory: 'Plastic',
      description: 'Clean segregated PET bottles',
      estimatedQuantity: 15.5,
      estimatedUnit: 'kg',
      street: '123 Eco Way',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
      preferredDate: new Date(Date.now() + 86400000).toISOString(),
      preferredTimeSlot: 'Morning (8am - 12pm)',
    });

    assert.strictEqual(validRes.status, 201);
    assert.strictEqual(validRes.body.success, true);
    assert.strictEqual(validRes.body.pickup.status, 'Requested');
    testPickupId = validRes.body.pickup._id;

    // View own pickup
    const viewRes = await citizenAgent.get(`/api/pickups/${testPickupId}`);
    assert.strictEqual(viewRes.status, 200);
    assert.strictEqual(viewRes.body.pickup.wasteCategory, 'Plastic');
  });

  it('Scenario 6: Cross-citizen isolation (another citizen cannot view the pickup)', async () => {
    // Register second citizen
    await citizen2Agent.post('/api/auth/register').send({
      name: 'Second Citizen',
      email: 'citizen2@example.com',
      phone: '9876543222',
      password: 'Password@123',
      confirmPassword: 'Password@123',
      street: '456 Other Way',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560002',
    });

    // Attempt to access first citizen's pickup
    const forbiddenRes = await citizen2Agent.get(`/api/pickups/${testPickupId}`);
    assert.strictEqual(forbiddenRes.status, 403);
    assert.strictEqual(forbiddenRes.body.success, false);
  });

  it('Scenario 7 & 8: Administrator setup, assignment, and authorization enforcement', async () => {
    // Create admin user directly in DB
    const adminUser = await User.create({
      name: 'Master Admin',
      email: 'admin@example.com',
      phone: '9999999999',
      password: 'AdminPassword@123',
      role: 'admin',
      accountStatus: 'active',
    });

    // Check that citizen CANNOT access admin endpoints
    const unauthRes = await citizenAgent.get('/api/admin/users');
    assert.strictEqual(unauthRes.status, 403);

    // Admin logs in
    await adminAgent.post('/api/auth/login').send({
      email: 'admin@example.com',
      password: 'AdminPassword@123',
    });

    // Admin creates recycling center 1
    const centerRes1 = await adminAgent.post('/api/admin/centers').send({
      name: 'Main Processing Facility',
      street: 'Ind Area 1',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560058',
      contactPhone: '9811111111',
      contactEmail: 'center1@example.com',
      acceptedCategories: ['Plastic', 'Glass', 'Paper and cardboard'],
    });
    assert.strictEqual(centerRes1.status, 201);
    testCenterId = centerRes1.body.center._id;

    // Admin creates recycling center 2
    const centerRes2 = await adminAgent.post('/api/admin/centers').send({
      name: 'Secondary Recycling Depot',
      street: 'Ind Area 2',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560060',
      contactPhone: '9822222222',
      contactEmail: 'center2@example.com',
      acceptedCategories: ['Organic waste'],
    });
    otherCenterId = centerRes2.body.center._id;

    // Admin creates Collector 1
    const collectorRes1 = await adminAgent.post('/api/admin/users').send({
      name: 'Collector Dave',
      email: 'dave@collector.com',
      phone: '9833333333',
      password: 'Password@123',
      role: 'collector',
      vehicleType: 'Electric Van',
      vehicleNumber: 'KA-01-9999',
    });
    assert.strictEqual(collectorRes1.status, 201);
    testCollectorId = collectorRes1.body.user._id;

    // Admin creates Collector 2
    const collectorRes2 = await adminAgent.post('/api/admin/users').send({
      name: 'Collector Bob',
      email: 'bob@collector.com',
      phone: '9844444444',
      password: 'Password@123',
      role: 'collector',
      vehicleType: 'Light Truck',
      vehicleNumber: 'KA-01-8888',
    });
    otherCollectorId = collectorRes2.body.user._id;

    // Admin assigns Collector Dave and Center 1 to test pickup
    const assignRes = await adminAgent.post(`/api/admin/pickups/${testPickupId}/assign`).send({
      collectorId: testCollectorId,
      recyclingCenterId: testCenterId,
    });

    assert.strictEqual(assignRes.status, 200);
    assert.strictEqual(assignRes.body.pickup.status, 'Assigned');
    assert.strictEqual(assignRes.body.pickup.collector._id.toString(), testCollectorId.toString());
  });

  it('Scenario 9, 10, & 13: Collector operations, isolation, and status transition rules', async () => {
    // Log in Collector Dave
    await collectorAgent.post('/api/auth/login').send({
      email: 'dave@collector.com',
      password: 'Password@123',
    });

    // Log in Collector Bob (unrelated collector)
    await otherCollectorAgent.post('/api/auth/login').send({
      email: 'bob@collector.com',
      password: 'Password@123',
    });

    // Collector Bob attempts to modify Collector Dave's pickup -> 404
    const bobAttempt = await otherCollectorAgent
      .post(`/api/collector/pickups/${testPickupId}/collect`)
      .send({ collectedWeight: 16.0 });
    assert.strictEqual(bobAttempt.status, 404);

    // Collector Dave attempts invalid transition: Deliver before Collecting -> 400
    const prematureDeliver = await collectorAgent
      .post(`/api/collector/pickups/${testPickupId}/deliver`)
      .send({ deliveryNotes: 'Tried to deliver early' });
    assert.strictEqual(prematureDeliver.status, 400);

    // Collector Dave records valid collection
    const collectRes = await collectorAgent
      .post(`/api/collector/pickups/${testPickupId}/collect`)
      .send({
        collectedWeight: 16.8,
        collectionNotes: 'Collected in good condition',
      });

    assert.strictEqual(collectRes.status, 200);
    assert.strictEqual(collectRes.body.pickup.status, 'Collected');
    assert.strictEqual(collectRes.body.pickup.collectionDetails.collectedWeight, 16.8);

    // Collector Dave records delivery at recycling center
    const deliverRes = await collectorAgent
      .post(`/api/collector/pickups/${testPickupId}/deliver`)
      .send({ deliveryNotes: 'Dropped at Intake Bay A' });

    assert.strictEqual(deliverRes.status, 200);
    assert.strictEqual(deliverRes.body.pickup.status, 'Delivered');
  });

  it('Scenario 11 & 12: Recycling Center receipt, cross-center isolation, and completion', async () => {
    // Create Manager for Center 1
    await adminAgent.post('/api/admin/users').send({
      name: 'Manager Center 1',
      email: 'mgr1@center.com',
      phone: '9855555555',
      password: 'Password@123',
      role: 'center',
      centerId: testCenterId,
    });

    // Create Manager for Center 2
    await adminAgent.post('/api/admin/users').send({
      name: 'Manager Center 2',
      email: 'mgr2@center.com',
      phone: '9866666666',
      password: 'Password@123',
      role: 'center',
      centerId: otherCenterId,
    });

    // Log in Center 1 Manager
    await centerAgent.post('/api/auth/login').send({
      email: 'mgr1@center.com',
      password: 'Password@123',
    });

    // Log in Center 2 Manager
    await otherCenterAgent.post('/api/auth/login').send({
      email: 'mgr2@center.com',
      password: 'Password@123',
    });

    // Center 2 attempts to confirm Center 1's delivery -> 404/rejected
    const unauthorizedConfirm = await otherCenterAgent
      .post(`/api/center/deliveries/${testPickupId}/confirm`)
      .send({
        receivedWeight: 16.8,
        processingOutcome: 'Recycled',
      });
    assert.strictEqual(unauthorizedConfirm.status, 404);

    // Center 1 confirms delivery and records processing
    const confirmRes = await centerAgent
      .post(`/api/center/deliveries/${testPickupId}/confirm`)
      .send({
        receivedWeight: 16.8,
        rejectedWeight: 0.8,
        rejectionReason: 'Contaminated caps and labels',
        processingOutcome: 'Recycled',
        processingNotes: 'Shredded into PET flakes for yarn extrusion',
      });

    assert.strictEqual(confirmRes.status, 200);
    assert.strictEqual(confirmRes.body.pickup.status, 'Completed');
    assert.strictEqual(confirmRes.body.record.netRecycledWeight, 16.0);
  });

  it('Scenario 15: Completing a pickup updates dashboard metrics with real database data', async () => {
    const adminStatsRes = await adminAgent.get('/api/dashboard/stats');
    assert.strictEqual(adminStatsRes.status, 200);
    assert.strictEqual(adminStatsRes.body.metrics.completedPickups, 1);
    assert.strictEqual(adminStatsRes.body.metrics.totalRecycledKg, 16);

    const publicStatsRes = await request(app).get('/api/dashboard/public-stats');
    assert.strictEqual(publicStatsRes.status, 200);
    assert.strictEqual(publicStatsRes.body.stats.completedPickups, 1);
  });

  it('Scenario 16: An empty database does not cause dashboard errors', async () => {
    // Temporarily clear records
    await Pickup.deleteMany({});
    await RecyclingRecord.deleteMany({});

    const emptyStats = await adminAgent.get('/api/dashboard/stats');
    assert.strictEqual(emptyStats.status, 200);
    assert.strictEqual(emptyStats.body.metrics.completedPickups, 0);
    assert.strictEqual(emptyStats.body.metrics.totalPickups, 0);
  });
});
