import { Request, Response } from "express";
import { QuestionShelfService } from "../modules/question-bank/question-shelf.service";

export class QuestionShelfController {
  
  /**
   * GET /api/assessments/shelves
   * Returns all shelves with counts and timestamps
   */
  public static async listShelves(req: Request, res: Response) {
    try {
      const shelves = await QuestionShelfService.getShelves();
      return res.json({ success: true, data: shelves });
    } catch (error: any) {
      console.error("❌ Controller error listShelves:", error);
      return res.status(500).json({ success: false, error: error.message || "Failed to fetch shelves" });
    }
  }

  /**
   * GET /api/assessments/shelves/:category
   * Returns all questions in a shelf/category folder
   */
  public static async getShelfDetail(req: Request, res: Response) {
    try {
      const category = String(req.params.category || "");
      const questions = await QuestionShelfService.getShelfQuestions(category);
      return res.json({ success: true, data: questions });
    } catch (error: any) {
      console.error("❌ Controller error getShelfDetail:", error);
      return res.status(500).json({ success: false, error: error.message || "Failed to fetch shelf details" });
    }
  }

  /**
   * POST /api/assessments/shelves/:category
   * Manually adds a question to a category shelf
   */
  public static async addQuestionToShelf(req: Request, res: Response) {
    try {
      const category = String(req.params.category || "");
      const { question_text, options, correct_option, difficulty, topic, explanation } = req.body;

      if (!question_text || !options || !correct_option) {
        return res.status(400).json({
          success: false,
          error: "question_text, options, and correct_option are required"
        });
      }

      const questionObj = {
        question_text,
        options,
        correct_option,
        difficulty: difficulty || "medium",
        topic: topic || category,
        explanation: explanation || ""
      };

      const result = await QuestionShelfService.saveQuestionToShelf(
        questionObj,
        topic || category,
        "Manual Entry"
      );

      if (result) {
        return res.status(201).json({ success: true, message: "Question successfully added to shelf" });
      } else {
        return res.status(409).json({ success: false, error: "DUPLICATE_QUESTION", message: "Question already exists on this shelf" });
      }
    } catch (error: any) {
      console.error("❌ Controller error addQuestionToShelf:", error);
      return res.status(500).json({ success: false, error: error.message || "Failed to add question to shelf" });
    }
  }

  /**
   * DELETE /api/assessments/shelves/:category/questions
   * Deletes a question from a shelf using its hash
   */
  public static async deleteQuestionFromShelf(req: Request, res: Response) {
    try {
      const category = String(req.params.category || "");
      // Accept hash from either query parameter or request body
      const hash = String(req.query.hash || req.body.hash || "").trim();

      if (!hash) {
        return res.status(400).json({ success: false, error: "Question hash is required to delete" });
      }

      const deleted = await QuestionShelfService.deleteQuestion(category, hash);

      if (deleted) {
        return res.json({ success: true, message: "Question deleted successfully from shelf" });
      } else {
        return res.status(404).json({ success: false, error: "Question not found on this shelf" });
      }
    } catch (error: any) {
      console.error("❌ Controller error deleteQuestionFromShelf:", error);
      return res.status(500).json({ success: false, error: error.message || "Failed to delete question" });
    }
  }

  /**
   * DELETE /api/assessments/shelves/:category
   * Deletes an entire shelf folder and all questions in it
   */
  public static async deleteShelf(req: Request, res: Response) {
    try {
      const category = String(req.params.category || "");
      if (!category) {
        return res.status(400).json({ success: false, error: "Category is required" });
      }

      const deleted = await QuestionShelfService.deleteShelf(category);
      if (deleted) {
        return res.json({ success: true, message: `Shelf category "${category}" deleted successfully` });
      } else {
        return res.status(404).json({ success: false, error: "Shelf category not found or already deleted" });
      }
    } catch (error: any) {
      console.error("❌ Controller error deleteShelf:", error);
      return res.status(500).json({ success: false, error: error.message || "Failed to delete shelf" });
    }
  }
}
