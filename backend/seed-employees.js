// This script seeds the database with initial employees
require('dotenv').config();
const db = require('./services/databaseService');
const employees = require('./employees.json');

async function seedEmployees() {
  try {
    console.log('Seeding employees...');
    
    for (const emp of employees) {
      const email = emp.email || `${emp.name.toLowerCase().replace(/\s+/g, '')}@example.com`;
      await db.getOrCreateEmployee(emp.name, email);
      console.log(`Created/Updated employee: ${emp.name}`);
    }
    
    console.log('Employee seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding employees:', error);
    process.exit(1);
  }
}

seedEmployees();