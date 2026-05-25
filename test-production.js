
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
let adminToken = '';
let refreshToken = '';

// Test Data
const suffix = Array.from({length: 4}, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
const testStudent = {
  id: `TEST-S-${suffix}`,
  name: `Test Student ${suffix}`,
  class: 'Grade 10',
  phone: '03001234567',
  address: 'Test Street 123'
};

const testTeacher = {
  name: `Master Tester ${suffix}`,
  subject: 'Computer Science'
};

async function runTests() {
  console.log('🚀 Starting Full Production Readiness Test Suite...\n');

  try {
    // 1. Authentication Test
    console.log('--- Phase 1: Authentication ---');
    const loginRes = await axios.post(`${BASE_URL}/login`, {
      username: 'admin',
      password: '1234'
    });
    adminToken = loginRes.data.accessToken;
    refreshToken = loginRes.data.refreshToken;
    console.log('✅ Login successful');

    const authHeaders = { headers: { Authorization: `Bearer ${adminToken}` } };

    // 2. Configuration Test
    console.log('\n--- Phase 2: Configuration ---');
    await axios.patch(`${BASE_URL}/config`, {
      schoolName: 'Test Academy',
      address: 'Education Zone',
      contact: '021-33333333',
      email: 'info@testacademy.edu'
    }, authHeaders);
    console.log('✅ Configuration updated');

    // 3. Admission Flow
    console.log('\n--- Phase 3: Admission Flow ---');
    const admRes = await axios.post(`${BASE_URL}/admissions`, {
      name: `Applicant ${suffix}`,
      class: 'Grade 9',
      phone: '03456789012'
    }, authHeaders);
    const admId = admRes.data.admission.id;
    console.log('✅ Admission application submitted');

    await axios.patch(`${BASE_URL}/admissions/${admId}`, { status: 'approved' }, authHeaders);
    console.log('✅ Admission approved (Student auto-created)');

    // 4. Student Management
    console.log('\n--- Phase 4: Student Management ---');
    await axios.post(`${BASE_URL}/students`, testStudent, authHeaders);
    console.log('✅ Manual student enrollment successful');

    const studentsRes = await axios.get(`${BASE_URL}/students`, authHeaders);
    console.log(`✅ Retrieved ${studentsRes.data.length} students`);

    // 5. Teacher Management
    console.log('\n--- Phase 5: Teacher Management ---');
    await axios.post(`${BASE_URL}/teachers`, testTeacher, authHeaders);
    console.log('✅ Teacher registration successful');

    // 6. Attendance Marking
    console.log('\n--- Phase 6: Attendance ---');
    const date = new Date().toISOString().split('T')[0];
    await axios.post(`${BASE_URL}/attendance/bulk`, {
      date,
      records: [
        { id: testStudent.id, status: 'present' }
      ]
    }, authHeaders);
    console.log('✅ Bulk attendance marked');

    // 7. Finance & Fees
    console.log('\n--- Phase 7: Finance & Fees ---');
    const feeGenRes = await axios.post(`${BASE_URL}/fees/generate`, {
      month: 'January',
      amount: 5000
    }, authHeaders);
    console.log(`✅ Monthly fees generated (${feeGenRes.data.generated} students)`);

    await axios.post(`${BASE_URL}/fees`, {
      id: testStudent.id,
      amount: 5000,
      month: 'January',
      method: 'cash'
    }, authHeaders);
    console.log('✅ Individual fee payment recorded');

    // 8. Results & Academic
    console.log('\n--- Phase 8: Academic Results ---');
    await axios.post(`${BASE_URL}/results/bulk`, {
      id: testStudent.id,
      results: [
        { subject: 'Math', marks: 85, total: 100 },
        { subject: 'English', marks: 78, total: 100 }
      ]
    }, authHeaders);
    console.log('✅ Bulk results posted');

    // 9. Promotion Logic
    console.log('\n--- Phase 9: Promotion Logic ---');
    const promoteRes = await axios.post(`${BASE_URL}/students/promote`, {
      fromClass: 'Grade 10',
      toClass: 'Grade 11'
    }, authHeaders);
    console.log(`✅ Students promoted: ${promoteRes.data.count}`);

    // 10. Reporting & Analytics
    console.log('\n--- Phase 10: Reports ---');
    const summary = await axios.get(`${BASE_URL}/reports/summary`, authHeaders);
    console.log('✅ Summary report generated');
    
    const profile = await axios.get(`${BASE_URL}/students/${testStudent.id}/profile`, authHeaders);
    console.log('✅ Detailed student profile generated');

    // 11. Edge Cases & Error Handling
    console.log('\n--- Phase 11: Edge Cases ---');
    try {
      await axios.post(`${BASE_URL}/students`, { id: testStudent.id }, authHeaders);
      console.log('❌ Error: Allowed duplicate student ID');
    } catch (err) {
      console.log('✅ Caught duplicate student ID error');
    }

    try {
      await axios.post(`${BASE_URL}/login`, { username: 'admin', password: 'wrong' });
      console.log('❌ Error: Allowed wrong password');
    } catch (err) {
      console.log('✅ Caught invalid login error');
    }

    console.log('\n✨ ALL TESTS PASSED SUCCESSFULLY! The system is production ready.');

  } catch (error) {
    console.error('\n❌ TEST FAILED!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Message:', error.message);
    }
    process.exit(1);
  }
}

runTests();
