/**
 * Database Seeder Script
 * Populates realistic initial development data:
 * - 1 Administrator account
 * - 2 Recycling Centers with managers
 * - 2 Active Waste Collectors
 * - 2 Citizens
 * - Sample pickups at various lifecycle stages
 * - Facility recycling records and audit logs
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const RecyclingCenter = require('../models/RecyclingCenter');
const Pickup = require('../models/Pickup');
const RecyclingRecord = require('../models/RecyclingRecord');
const ActivityLog = require('../models/ActivityLog');

const seedDatabase = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wastewise';

  try {
    console.log('[Seeder] Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('[Seeder] Connected successfully.');

    // Clear existing collections safely
    console.log('[Seeder] Clearing old records...');
    await Promise.all([
      User.deleteMany({}),
      RecyclingCenter.deleteMany({}),
      Pickup.deleteMany({}),
      RecyclingRecord.deleteMany({}),
      ActivityLog.deleteMany({}),
    ]);

    // Common password for demo accounts
    const demoPassword = process.env.DEMO_PASSWORD || 'Password@123';

    // 1. Create Administrator
    console.log('[Seeder] Creating Administrator...');
    const admin = await User.create({
      name: 'System Administrator',
      email: 'admin@wastewise.org',
      phone: '+91 98765 43210',
      password: demoPassword,
      role: 'admin',
      accountStatus: 'active',
      address: {
        street: '100 Municipal Civic Center',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
      },
    });

    // 2. Create Recycling Centers
    console.log('[Seeder] Creating Recycling Facilities...');
    const center1 = await RecyclingCenter.create({
      name: 'GreenEco Materials Recovery Facility',
      address: {
        street: 'Plot 42, Industrial Area Phase 1',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560058',
      },
      contactPhone: '+91 80 2345 6789',
      contactEmail: 'contact@greeneco-mrf.org',
      acceptedCategories: [
        'Plastic',
        'Paper and cardboard',
        'Glass',
        'Metal',
        'Electronic waste',
      ],
      dailyCapacityKg: 8000,
      operatingHours: '08:00 AM - 06:00 PM (Mon-Sat)',
      isActive: true,
    });

    const center2 = await RecyclingCenter.create({
      name: 'EcoBio Composting & Organics Hub',
      address: {
        street: 'Survey 18, AgriTech Green Zone',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560064',
      },
      contactPhone: '+91 80 8765 4321',
      contactEmail: 'info@ecobio-hub.org',
      acceptedCategories: ['Organic waste', 'Paper and cardboard'],
      dailyCapacityKg: 12000,
      operatingHours: '07:00 AM - 05:00 PM (Daily)',
      isActive: true,
    });

    // 3. Create Center Managers
    console.log('[Seeder] Creating Center Managers...');
    const centerUser1 = await User.create({
      name: 'Rajesh Verma (GreenEco Manager)',
      email: 'center1@wastewise.org',
      phone: '+91 98111 22334',
      password: demoPassword,
      role: 'center',
      accountStatus: 'active',
      centerRef: center1._id,
      address: {
        street: 'Peenya Industrial Area',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560058',
      },
    });
    center1.managerUser = centerUser1._id;
    await center1.save();

    const centerUser2 = await User.create({
      name: 'Dr. Sunita Rao (EcoBio Director)',
      email: 'center2@wastewise.org',
      phone: '+91 98222 33445',
      password: demoPassword,
      role: 'center',
      accountStatus: 'active',
      centerRef: center2._id,
      address: {
        street: 'Yelahanka Green Belt',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560064',
      },
    });
    center2.managerUser = centerUser2._id;
    await center2.save();

    // 4. Create Collectors
    console.log('[Seeder] Creating Waste Collectors...');
    const collector1 = await User.create({
      name: 'Ramesh Kumar',
      email: 'collector1@wastewise.org',
      phone: '+91 99001 12233',
      password: demoPassword,
      role: 'collector',
      accountStatus: 'active',
      collectorInfo: {
        vehicleType: 'Electric Waste Van',
        vehicleNumber: 'KA-01-EV-4421',
        isOnDuty: true,
      },
      address: {
        street: '14th Cross, Malleshwaram',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560003',
      },
    });

    const collector2 = await User.create({
      name: 'Suresh Patil',
      email: 'collector2@wastewise.org',
      phone: '+91 99002 23344',
      password: demoPassword,
      role: 'collector',
      accountStatus: 'active',
      collectorInfo: {
        vehicleType: 'Compactor Light Truck',
        vehicleNumber: 'KA-04-TR-8819',
        isOnDuty: true,
      },
      address: {
        street: '8th Main, Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560038',
      },
    });

    // 5. Create Citizens
    console.log('[Seeder] Creating Citizens...');
    const citizen1 = await User.create({
      name: 'Aarav Sharma',
      email: 'citizen1@wastewise.org',
      phone: '+91 98450 11223',
      password: demoPassword,
      role: 'citizen',
      accountStatus: 'active',
      address: {
        street: 'Flat 402, Sunshine Meadows, 5th Cross',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560034',
        landmark: 'Near Koramangala BDA Complex',
      },
    });

    const citizen2 = await User.create({
      name: 'Priya Nambiar',
      email: 'citizen2@wastewise.org',
      phone: '+91 98450 33445',
      password: demoPassword,
      role: 'citizen',
      accountStatus: 'active',
      address: {
        street: 'Villa 12, Green Oaks Enclave, HSR Layout Sector 2',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560102',
        landmark: 'Opposite Sector 2 Park',
      },
    });

    // 6. Create Pickups covering all lifecycle states
    console.log('[Seeder] Creating Pickups across workflow states...');

    // State 1: Requested (Awaiting Admin Assignment)
    await Pickup.create({
      citizen: citizen1._id,
      wasteCategory: 'Electronic waste',
      description: '2 obsolete laptops, old routers, and broken chargers',
      estimatedQuantity: 6.5,
      estimatedUnit: 'kg',
      address: citizen1.address,
      preferredDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      preferredTimeSlot: 'Morning (8am - 12pm)',
      additionalInstructions: 'Call before arriving; gated community security pass needed',
      status: 'Requested',
    });

    // State 2: Assigned (Collector Assigned, Ready to Collect)
    await Pickup.create({
      citizen: citizen2._id,
      wasteCategory: 'Paper and cardboard',
      description: 'Flattened corrugated shipping cartons and old textbooks',
      estimatedQuantity: 18.0,
      estimatedUnit: 'kg',
      address: citizen2.address,
      preferredDate: new Date(Date.now() + 12 * 60 * 60 * 1000),
      preferredTimeSlot: 'Afternoon (12pm - 4pm)',
      collector: collector1._id,
      recyclingCenter: center1._id,
      status: 'Assigned',
    });

    // State 3: Collected (Picked up, In Transit to Recycling Center)
    await Pickup.create({
      citizen: citizen1._id,
      wasteCategory: 'Plastic',
      description: 'Sorted HDPE and PET plastic bottles and containers',
      estimatedQuantity: 12.0,
      estimatedUnit: 'kg',
      address: citizen1.address,
      preferredDate: new Date(),
      preferredTimeSlot: 'Morning (8am - 12pm)',
      collector: collector1._id,
      recyclingCenter: center1._id,
      status: 'Collected',
      collectionDetails: {
        collectedWeight: 14.2,
        collectionNotes: 'Clean, baled plastic containers; weighed on portable digital scale.',
        collectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    });

    // State 4: Delivered (Dropped at Facility, Awaiting Center Verification)
    await Pickup.create({
      citizen: citizen2._id,
      wasteCategory: 'Organic waste',
      description: 'Garden trimmings, dried leaves, and kitchen compostable scraps',
      estimatedQuantity: 25.0,
      estimatedUnit: 'kg',
      address: citizen2.address,
      preferredDate: new Date(Date.now() - 4 * 60 * 60 * 1000),
      preferredTimeSlot: 'Morning (8am - 12pm)',
      collector: collector2._id,
      recyclingCenter: center2._id,
      status: 'Delivered',
      collectionDetails: {
        collectedWeight: 26.5,
        collectionNotes: 'Well segregated organic waste in biodegradable sacks.',
        collectedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
      deliveryDetails: {
        deliveryNotes: 'Delivered to Intake Bay 2 at EcoBio Composting Hub.',
        deliveredAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      },
    });

    // State 5: Completed (Verified and Processed into Resource)
    const completedPickup1 = await Pickup.create({
      citizen: citizen1._id,
      wasteCategory: 'Glass',
      description: 'Separated clear and amber beverage bottles and jars',
      estimatedQuantity: 20.0,
      estimatedUnit: 'kg',
      address: citizen1.address,
      preferredDate: new Date(Date.now() - 48 * 60 * 60 * 1000),
      preferredTimeSlot: 'Evening (4pm - 8pm)',
      collector: collector1._id,
      recyclingCenter: center1._id,
      status: 'Completed',
      collectionDetails: {
        collectedWeight: 22.0,
        collectionNotes: 'Intact glass containers safely packed in crates.',
        collectedAt: new Date(Date.now() - 46 * 60 * 60 * 1000),
      },
      deliveryDetails: {
        deliveryNotes: 'Delivered to Glass Sorting Section.',
        deliveredAt: new Date(Date.now() - 44 * 60 * 60 * 1000),
      },
      recyclingDetails: {
        receivedWeight: 22.0,
        rejectedWeight: 1.5,
        rejectionReason: 'Damaged ceramic/heat-resistant glass contaminants',
        processingOutcome: 'Recycled',
        processingNotes: 'Crushed into cullet for glass re-melting and bottle manufacturing.',
        verifiedBy: centerUser1._id,
        completedAt: new Date(Date.now() - 42 * 60 * 60 * 1000),
      },
    });

    // Create facility record for completed pickup 1
    await RecyclingRecord.create({
      pickup: completedPickup1._id,
      recyclingCenter: center1._id,
      materialCategories: ['Glass'],
      receivedWeight: 22.0,
      rejectedWeight: 1.5,
      netRecycledWeight: 20.5,
      processingOutcome: 'Recycled',
      notes: 'Crushed into cullet for glass re-melting.',
      recordedBy: centerUser1._id,
    });

    // State 6: Completed (Organic Composted)
    const completedPickup2 = await Pickup.create({
      citizen: citizen2._id,
      wasteCategory: 'Organic waste',
      description: 'Horticultural and vegetable organic waste',
      estimatedQuantity: 35.0,
      estimatedUnit: 'kg',
      address: citizen2.address,
      preferredDate: new Date(Date.now() - 72 * 60 * 60 * 1000),
      preferredTimeSlot: 'Morning (8am - 12pm)',
      collector: collector2._id,
      recyclingCenter: center2._id,
      status: 'Completed',
      collectionDetails: {
        collectedWeight: 34.0,
        collectionNotes: 'Clean organic load collected.',
        collectedAt: new Date(Date.now() - 70 * 60 * 60 * 1000),
      },
      deliveryDetails: {
        deliveryNotes: 'Delivered to aerobic windrow compost heap 4.',
        deliveredAt: new Date(Date.now() - 68 * 60 * 60 * 1000),
      },
      recyclingDetails: {
        receivedWeight: 34.0,
        rejectedWeight: 0.5,
        rejectionReason: 'Non-biodegradable tape pieces removed during screening',
        processingOutcome: 'Composted',
        processingNotes: 'Transferred to thermophilic aerobic composting unit.',
        verifiedBy: centerUser2._id,
        completedAt: new Date(Date.now() - 66 * 60 * 60 * 1000),
      },
    });

    await RecyclingRecord.create({
      pickup: completedPickup2._id,
      recyclingCenter: center2._id,
      materialCategories: ['Organic waste'],
      receivedWeight: 34.0,
      rejectedWeight: 0.5,
      netRecycledWeight: 33.5,
      processingOutcome: 'Composted',
      notes: 'Aerobic windrow composting batch #ECO-2025-09.',
      recordedBy: centerUser2._id,
    });

    // 7. Seed Initial Audit Logs
    console.log('[Seeder] Creating Audit Trail...');
    await ActivityLog.log({
      user: admin._id,
      userName: admin.name,
      userRole: admin.role,
      action: 'SYSTEM_INITIALIZED',
      targetEntity: 'System',
      description: 'WasteWise Portal database seeded with baseline operational records',
    });

    console.log('====================================================');
    console.log(' SEEDING COMPLETED SUCCESSFULLY! ');
    console.log('====================================================');
    console.log('DEMO ACCOUNTS READY FOR EVALUATION AND TESTING:');
    console.log('----------------------------------------------------');
    console.log('1. Admin:            admin@wastewise.org     / ' + demoPassword);
    console.log('2. Collector 1:      collector1@wastewise.org / ' + demoPassword);
    console.log('3. Collector 2:      collector2@wastewise.org / ' + demoPassword);
    console.log('4. Center 1 Manager: center1@wastewise.org    / ' + demoPassword);
    console.log('5. Center 2 Manager: center2@wastewise.org    / ' + demoPassword);
    console.log('6. Citizen 1:        citizen1@wastewise.org   / ' + demoPassword);
    console.log('7. Citizen 2:        citizen2@wastewise.org   / ' + demoPassword);
    console.log('====================================================');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('[Seeder Error]', err);
    process.exit(1);
  }
};

seedDatabase();
