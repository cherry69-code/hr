const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// 1. Define URIs from environment (never hardcode secrets)
const SOURCE_URI = process.env.MIGRATE_SOURCE_URI;
const DEST_URI = process.env.MIGRATE_DEST_URI;

if (!SOURCE_URI || !DEST_URI) {
  console.error('Missing MIGRATE_SOURCE_URI or MIGRATE_DEST_URI in environment. Aborting migration to avoid leaking credentials.');
  process.exit(1);
}

// 2. Load Models
const modelsDir = path.join(__dirname, '../models');
const modelFiles = fs.readdirSync(modelsDir).filter(f => f.endsWith('.js'));

const loadModel = (file) => require(path.join(modelsDir, file));

const migrate = async () => {
  console.log('Starting migration...');
  console.log(`Source: ${SOURCE_URI}`);
  console.log(`Dest:   ${DEST_URI}`);

  // Connect to Source
  const srcConn = mongoose.createConnection(SOURCE_URI);
  await new Promise((resolve) => srcConn.once('open', resolve));
  console.log('Connected to Source DB');

  // Connect to Destination
  const destConn = mongoose.createConnection(DEST_URI);
  await new Promise((resolve) => destConn.once('open', resolve));
  console.log('Connected to Destination DB');

  // Process each model
  for (const file of modelFiles) {
    const modelDef = loadModel(file);
    const modelName = modelDef.modelName;
    const schema = modelDef.schema;

    console.log(`Migrating ${modelName}...`);

    // Create models bound to connections
    const SrcModel = srcConn.model(modelName, schema);
    const DestModel = destConn.model(modelName, schema);

    // Fetch data from Source
    const docs = await SrcModel.find({}).lean();
    console.log(`  Found ${docs.length} documents in Source.`);

    if (docs.length > 0) {
      // Insert into Destination
      // Use ordered: false to continue even if duplicates exist (skip existing)
      try {
        const result = await DestModel.insertMany(docs, { ordered: false });
        console.log(`  Inserted ${result.length} documents into Destination.`);
      } catch (err) {
        if (err.writeErrors) {
          console.log(`  Inserted ${err.insertedDocs.length} documents (skipped ${err.writeErrors.length} duplicates/errors).`);
        } else {
          console.error(`  Error inserting: ${err.message}`);
        }
      }
    } else {
      console.log('  Skipping insert (empty).');
    }
  }

  console.log('Migration complete.');
  await srcConn.close();
  await destConn.close();
  process.exit(0);
};

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
