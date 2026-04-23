const autocannon = require('autocannon');

async function run() {
  console.log('Starting load test with 1,000 concurrent connections...');
  const result = await autocannon({
    url: 'http://localhost:5000/api/submissions',
    connections: 1000,
    pipelining: 1,
    duration: 10,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      studentId: 'TEST001',
      name: 'Load Tester',
      grade: '8',
      schoolName: 'Load Test School',
      projectTitle: 'Stress Test',
      idea: 'Test the system under load'
    })
  });

  console.log('--- Results ---');    
  console.log(`Req/Sec: ${result.requests.average}`);
  console.log(`Latency p95: ${result.latency.p95} ms`);
  console.log(`Latency max: ${result.latency.max} ms`);
  console.log(`Errors: ${result.errors}`);
  console.log(`2xx Responses: ${result['2xx']}`);
  console.log(`Non-2xx Responses: ${result.non2xx}`);
}

run();
