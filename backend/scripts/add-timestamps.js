const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/amanzi_ats'
});

async function addTimestamps() {
  try {
    console.log('Adding created_at and updated_at columns...');
    
    // Add columns to resumes table
    await pool.query(`
      ALTER TABLE resumes
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    `);
    console.log('✅ Added timestamps to resumes table');
    
    // Add columns to candidates table
    await pool.query(`
      ALTER TABLE candidates
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    `);
    console.log('✅ Added timestamps to candidates table');
    
    // Create trigger function for resumes
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_resumes_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    await pool.query(`
      DROP TRIGGER IF EXISTS set_resumes_updated_at ON resumes;
      CREATE TRIGGER set_resumes_updated_at
      BEFORE UPDATE ON resumes
      FOR EACH ROW
      EXECUTE FUNCTION update_resumes_timestamp();
    `);
    console.log('✅ Created trigger for resumes');
    
    // Create trigger function for candidates
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_candidates_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    await pool.query(`
      DROP TRIGGER IF EXISTS set_candidates_updated_at ON candidates;
      CREATE TRIGGER set_candidates_updated_at
      BEFORE UPDATE ON candidates
      FOR EACH ROW
      EXECUTE FUNCTION update_candidates_timestamp();
    `);
    console.log('✅ Created trigger for candidates');
    
    console.log('✅ All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

addTimestamps();
