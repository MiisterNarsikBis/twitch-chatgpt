const express = require('express')
const request = require('request')
const app = express()
const fs = require('fs');
const { promisify } = require('util')
const readFile = promisify(fs.readFile)
const GPT_MODE = process.env.GPT_MODE

let file_context = "You are a helpful Twitch Chatbot."

const messages = [
  {role: "system", content: "You are a helpful Twitch Chatbot."}
];

console.log("GPT_MODE is " + GPT_MODE)
console.log("History length is " + process.env.HISTORY_LENGTH)
console.log("OpenAI API Key:" + process.env.OPENAI_API_KEY)

app.use(express.json({extended: true, limit: '1mb'}))

app.all('/', (req, res) => {
    console.log("Just got a request!")
    res.send('Yo!')
})

if (process.env.GPT_MODE === "CHAT"){

  fs.readFile("./file_context.txt", 'utf8', function(err, data) {
    if (err) throw err;
    console.log("Reading context file and adding it as system level message for the agent.")
    messages[0].content = data;
  });

} else {

  fs.readFile("./file_context.txt", 'utf8', function(err, data) {
    if (err) throw err;
    console.log("Reading context file and adding it in front of user prompts:")
    file_context = data;
    console.log(file_context);
  });

}

app.get('/gpt/:text', async (req, res) => {
    
    //The agent should recieve Username:Message in the text to identify conversations with different users in his history. 
    
    const text = req.params.text
    const { Configuration, OpenAIApi } = require("openai");

    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const openai = new OpenAIApi(configuration);      
    
    let maxLength = 399; // Longueur maximale souhaitée


    if (GPT_MODE === "CHAT"){
      //CHAT MODE EXECUTION

      //Add user message to  messages
      messages.push({role: "user", content: text})
      //Check if message history is exceeded
      console.log("Conversations in History: " + ((messages.length / 2) -1) + "/" + process.env.HISTORY_LENGTH)
      if(messages.length > ((process.env.HISTORY_LENGTH * 2) + 1)) {
          console.log('Message amount in history exceeded. Removing oldest user and agent messages.')
          messages.splice(1,2)
     }
    
      console.log("Messages: ")
      console.dir(messages)
      console.log("User Input: " + text)

      const response = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: messages,
        temperature: 0.5,
        max_tokens: 100,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      });
    
      if (response.data.choices) {
        let agent_response = response.data.choices[0].message.content

        console.log ("Agent answer: " + agent_response)
        messages.push({role: "assistant", content: agent_response})

        //Check for Twitch max. chat message length limit and slice if needed
        const punctuationRegex = /[.!?]+$/;
        const lastPunctuationMatch = agent_response.match(punctuationRegex);
        if (lastPunctuationMatch) {
          const lastPunctuationIndex = lastPunctuationMatch.index;
          // Couper le texte au dernier caractère de ponctuation
          agent_response = agent_response.slice(0, lastPunctuationIndex + lastPunctuationMatch[0].length);
        } else {
          // Si aucun caractère de ponctuation n'est trouvé, couper simplement à la limite de longueur
          agent_response = agent_response.slice(0, maxLength) + '...';
        }
        console.log("Sliced Agent answer: " + agent_response);
        

        res.send(agent_response)
      } else {
        res.send("Something went wrong. Try again later!")
      }

    } else {
      //PROMPT MODE EXECUTION
      const prompt = file_context + "\n\nQ:" + text + "\nA:";
      console.log("User Input: " + text)

      const response = await openai.createCompletion({
        model: "text-davinci-003",
        prompt: prompt,
        temperature: 0.5,
        max_tokens: 100,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      });
      if (response.data.choices) {
        let agent_response = response.data.choices[0].text
          console.log ("Agent answer: " + agent_response)
          //Check for Twitch max. chat message length limit and slice if needed

          if (agent_response.length > maxLength) {
            const lastPunctuationIndex = agent_response.search(/[.!?]+$/);
            if (lastPunctuationIndex !== -1) {
              // Couper le texte au dernier caractère de ponctuation
              agent_response = agent_response.slice(0, lastPunctuationIndex + 1);
            } else {
              // Si aucun caractère de ponctuation n'est trouvé, couper simplement à la limite de longueur
              agent_response = agent_response.slice(0, maxLength) + '...';
            }
            console.log("Sliced Agent answer: " + agent_response);
          }

          res.send(agent_response)
      } else {
          res.send("Something went wrong. Try again later!")
      }
    }
    
})
app.listen(process.env.PORT || 3000)
