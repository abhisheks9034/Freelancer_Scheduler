const Groq = require('groq-sdk');
require('dotenv').config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function main() {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: 'Hello' }],
      model: 'llama-3.3-70b-versatile',
    });
    console.log('✅ Connection Successful!');
    console.log('AI Reply:', chatCompletion.choices[0].message.content);
  } catch (error) {
    if (error.status === 401) {
      console.error('❌ Connection Failed: Invalid API Key. Please update server/.env with a real GROQ_API_KEY.');
    } else {
      console.error('❌ Error:', error.message);
    }
  }
}

main();
