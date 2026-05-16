import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();
export class GeminiService {
    genAI;
    embeddingModel;
    chatModel;
    constructor() {
        const apiKey = process.env.GEMINI_API_KEY || "";
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.embeddingModel = this.genAI.getGenerativeModel({ model: "text-embedding-004" });
        this.chatModel = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    }
    /**
     * Generate embedding for a given text
     */
    async generateEmbedding(text) {
        try {
            const result = await this.embeddingModel.embedContent(text);
            return result.embedding.values;
        }
        catch (error) {
            console.error("❌ Gemini Embedding Error:", error);
            throw new Error("Failed to generate embedding");
        }
    }
    /**
     * Generate content with retry logic and safety settings
     */
    async generateContent(prompt, retries = 3) {
        let lastError;
        for (let i = 0; i < retries; i++) {
            try {
                const result = await this.chatModel.generateContent(prompt);
                const response = await result.response;
                return response.text();
            }
            catch (error) {
                lastError = error;
                if (error.status === 429 || error.status === 503) {
                    const delay = Math.pow(2, i) * 1000;
                    console.warn(`⚠️ Gemini Rate Limited/Busy. Retry ${i + 1}/${retries} in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw error;
            }
        }
        throw lastError;
    }
}
export const geminiService = new GeminiService();
