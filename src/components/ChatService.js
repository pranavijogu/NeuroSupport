import axios from 'axios';

const MISTRAL_API_KEY = process.env.REACT_APP_MISTRAL_API_KEY;

const retryRequest = async (userMessage, conversationHistory, retries = 3, delay = 2000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`Attempt #${attempt}`);
            const response = await getBotResponse(userMessage, conversationHistory, false);
            return response;
        } catch (error) {
            console.error(`Attempt ${attempt} failed:`, error);
            if (error.response?.status === 400) {
                console.error("400 Bad Request: Check input or API key.", error.response.data);
                return { response: "AI response failed: Bad Request. Please try again later.", updatedHistory: conversationHistory };
            } else if (error.message.includes("warming up") || error.response?.status === 503) {
                console.log(`Mistral AI is warming up. Retrying in ${delay / 1000} seconds...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
                delay *= 2;
            } else {
                console.error("Unexpected error:", error);
                return { response: "Unexpected error occurred. Please try again later.", updatedHistory: conversationHistory };
            }
        }
    }
    return { response: "AI failed to respond after multiple attempts. Please try again later.", updatedHistory: conversationHistory };
};

export const getBotResponse = async (userMessage, conversationHistory = [], retry = true) => {
    console.log("User Message:", userMessage);
    console.log("Conversation History:", conversationHistory);

    const systemMessage = {
        role: 'system',
        content: `You are a supportive virtual friend helping people with autism and dyslexia navigate daily challenges. Your responses should:

        - Be concise and natural, matching the context (use 1-3 sentences for simple exchanges, 4-8 for complex topics)
        - Use clear, simple language
        - Be encouraging and patient
        - Provide practical strategies when relevant
        - Only offer detailed explanations when specifically asked or needed
        
        Remember the conversation context but avoid clinical diagnoses. Start with shorter responses and expand only when necessary.`
    };

    // Filter out any previous system messages from the history
    const filteredHistory = conversationHistory.filter(msg => msg.role !== 'system');

    // Create the messages array with system message and filtered history
    const messages = [
        systemMessage,
        ...filteredHistory,
        { role: 'user', content: userMessage }
    ];

    try {
        console.log("Making API call to Mistral...");
        const response = await axios.post(
            'https://api.mistral.ai/v1/chat/completions',
            {
                model: 'mistral-tiny',
                messages: messages,
                max_tokens: 500, // Adjusted for moderate length responses
                temperature: 0.7,
                top_p: 0.9
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.REACT_APP_MISTRAL_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );

        console.log('Full API Response:', response.data);

        const botResponse = response.data.choices?.[0]?.message?.content || "I couldn't generate a response.";
        const cleanedResponse = botResponse.trim();
        console.log('Cleaned Response:', cleanedResponse);

        return {
            response: cleanedResponse,
            updatedHistory: [
                ...filteredHistory,
                { role: 'user', content: userMessage },
                { role: 'assistant', content: cleanedResponse }
            ]
        };
    } catch (error) {
        console.error("Mistral API Error:", error.response?.data || error.message);
        if (retry) {
            console.log("Attempting retry...");
            return await retryRequest(userMessage, conversationHistory);
        }
        return { response: "AI response failed. Please try again later.", updatedHistory: conversationHistory };
    }
};