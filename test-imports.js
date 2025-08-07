// Simple test to verify imports work
import('./src/storage/database.ts')
  .then(module => {
    console.log('Available exports:', Object.keys(module));
    console.log('Shift export:', module.Shift);
    console.log('StaffMember export:', module.StaffMember);
    console.log('Database export:', module.Database);
  })
  .catch(err => {
    console.error('Import error:', err);
  });