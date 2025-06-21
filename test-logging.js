const { exec } = require('child_process');
const fs = require('fs');

// Test the enhanced logging functionality using curl
async function testLogging() {
  console.log('Testing enhanced logging functionality...\n');
  
  // Create a test CSV file
  const csvContent = 'username,email,firstName,lastName,populationId\ntestuser,test@example.com,Test,User,test-pop';
  fs.writeFileSync('test.csv', csvContent);
  
  try {
    // Test 1: Import operation
    console.log('1. Testing Import operation logging...');
    const importCommand = `curl -X POST http://localhost:3001/import-users \
      -F "environmentId=test-env" \
      -F "clientId=test-client" \
      -F "clientSecret=test-secret" \
      -F "mode=import" \
      -F "csv=@test.csv"`;
    
    exec(importCommand, (error, stdout, stderr) => {
      console.log('Import test completed (expected to fail due to invalid credentials)');
    });
    
    // Wait a moment for the request to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 2: Modify operation
    console.log('2. Testing Modify operation logging...');
    const modifyCommand = `curl -X POST http://localhost:3001/import-users \
      -F "environmentId=test-env" \
      -F "clientId=test-client" \
      -F "clientSecret=test-secret" \
      -F "mode=modify" \
      -F "csv=@test.csv"`;
    
    exec(modifyCommand, (error, stdout, stderr) => {
      console.log('Modify test completed (expected to fail due to invalid credentials)');
    });
    
    // Wait a moment for the request to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 3: Delete operation
    console.log('3. Testing Delete operation logging...');
    const deleteCommand = `curl -X POST http://localhost:3001/delete-users \
      -F "environmentId=test-env" \
      -F "clientId=test-client" \
      -F "clientSecret=test-secret" \
      -F "csv=@test.csv"`;
    
    exec(deleteCommand, (error, stdout, stderr) => {
      console.log('Delete test completed (expected to fail due to invalid credentials)');
    });
    
    // Wait a moment for the request to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\nAll tests completed. Check import-status.log for results.');
    
    // Clean up test file
    fs.unlinkSync('test.csv');
    
  } catch (error) {
    console.error('Test error:', error.message);
  }
}

// Run the test
testLogging(); 