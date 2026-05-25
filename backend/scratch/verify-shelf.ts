import { QuestionShelfService } from "../src/modules/question-bank/question-shelf.service";
import { pool, testConnection } from "../src/lib/database";
import fs from "fs/promises";
import path from "path";

async function runVerification() {
  console.log("🏁 Starting Auto Question Shelf System verification...");
  
  // Initialize tables (simulates server bootstrap)
  await testConnection();

  // Clean up any existing test folders to ensure clean run
  const testJavaDir = path.join(process.cwd(), "storage", "question-bank", "Java");
  const testReactDir = path.join(process.cwd(), "storage", "question-bank", "React");
  await fs.rm(testJavaDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(testReactDir, { recursive: true, force: true }).catch(() => {});

  // Clean database entries
  try {
    await pool.query("DELETE FROM question_bank WHERE category IN ('Java', 'React')");
    console.log("🧹 Cleaned database entries for testing.");
  } catch (err) {
    console.warn("⚠️ Failed to clean DB test entries:", err);
  }

  // 1. Define sample questions
  const q1 = {
    question_text: "What is a Java ThreadLocal class and how does it prevent thread conflicts?",
    options: {
      A: "It creates a separate copy of the variable for each thread.",
      B: "It locks the variable so only one thread can access it.",
      C: "It runs the variable in a synchronized block.",
      D: "It deletes the variable after execution."
    },
    correct_option: "A",
    difficulty: "advanced",
    topic: "Multithreading",
    explanation: "ThreadLocal variables allow threads to store private data."
  };

  const q2 = {
    question_text: "How do you use the useMemo hook in React to optimize re-renders?",
    options: {
      A: "It caches the computed value between renders.",
      B: "It triggers a force update.",
      C: "It creates a new state variable.",
      D: "It runs side effects."
    },
    correct_option: "A",
    difficulty: "medium",
    topic: "React Hooks",
    explanation: "useMemo memoizes slow calculations."
  };

  const q1Duplicate = {
    question_text: "what is a JAVA ThreadLocal class and how does it prevent thread conflicts!!!", // diff casing, punctuation
    options: {
      A: "It creates a separate copy.",
      B: "Locks variable.",
      C: "Synchronized block.",
      D: "Deletes variable."
    },
    correct_option: "A",
    difficulty: "advanced",
    topic: "Java concurrency",
    explanation: "Different explanation"
  };

  try {
    // 2. Test Category detection
    console.log("\n--- TEST 1: Category Detection ---");
    const cat1 = QuestionShelfService.determineCategory(q1.question_text, q1.topic, "Senior Backend Dev");
    const cat2 = QuestionShelfService.determineCategory(q2.question_text, q2.topic, "Frontend React Engineer");
    console.log(`Question 1 category detected: "${cat1}" (Expected: "Java")`);
    console.log(`Question 2 category detected: "${cat2}" (Expected: "React")`);

    if (cat1 !== "Java" || cat2 !== "React") {
      throw new Error("Category detection logic failed!");
    }
    console.log("✅ Category detection verified.");

    // 3. Test saving unique questions (auto folder creation, json storage, db sync)
    console.log("\n--- TEST 2: Unique Question Insertion ---");
    const saved1 = await QuestionShelfService.saveQuestionToShelf(q1, q1.topic, "Senior Backend Dev");
    const saved2 = await QuestionShelfService.saveQuestionToShelf(q2, q2.topic, "Frontend React Engineer");
    console.log(`Saved Question 1: ${saved1} (Expected: true)`);
    console.log(`Saved Question 2: ${saved2} (Expected: true)`);

    // Verify files exist
    const file1Content = await fs.readFile(path.join(testJavaDir, "questions.json"), "utf8");
    const file2Content = await fs.readFile(path.join(testReactDir, "questions.json"), "utf8");
    const parsedJava = JSON.parse(file1Content);
    const parsedReact = JSON.parse(file2Content);

    console.log(`Java questions in file: ${parsedJava.length} (Expected: 1)`);
    console.log(`React questions in file: ${parsedReact.length} (Expected: 1)`);

    // Verify DB count
    const dbJava = await pool.query("SELECT COUNT(*)::int FROM question_bank WHERE category = 'Java'");
    const dbReact = await pool.query("SELECT COUNT(*)::int FROM question_bank WHERE category = 'React'");
    console.log(`Java questions in DB: ${dbJava.rows[0].count} (Expected: 1)`);
    console.log(`React questions in DB: ${dbReact.rows[0].count} (Expected: 1)`);

    if (parsedJava.length !== 1 || parsedReact.length !== 1 || dbJava.rows[0].count !== 1 || dbReact.rows[0].count !== 1) {
      throw new Error("File or Database insertion sync failed!");
    }
    console.log("✅ Unique question insertion verified.");

    // 4. Test deduplication
    console.log("\n--- TEST 3: Deduplication Checks ---");
    const savedDup = await QuestionShelfService.saveQuestionToShelf(q1Duplicate, q1Duplicate.topic, "Java Test");
    console.log(`Saved Duplicate Java Question: ${savedDup} (Expected: false)`);

    const updatedJava = JSON.parse(await fs.readFile(path.join(testJavaDir, "questions.json"), "utf8"));
    console.log(`Java questions count after duplicate attempt: ${updatedJava.length} (Expected: 1)`);

    if (savedDup !== false || updatedJava.length !== 1) {
      throw new Error("Deduplication system failed!");
    }
    console.log("✅ Deduplication verified.");

    // 5. Test listing shelves
    console.log("\n--- TEST 4: Listing Shelves ---");
    const shelves = await QuestionShelfService.getShelves();
    console.log("Shelves list:", shelves);
    const javaShelf = shelves.find(s => s.category === "Java");
    const reactShelf = shelves.find(s => s.category === "React");
    
    console.log(`Java shelf count in list: ${javaShelf?.count} (Expected: 1)`);
    console.log(`React shelf count in list: ${reactShelf?.count} (Expected: 1)`);
    
    if (javaShelf?.count !== 1 || reactShelf?.count !== 1) {
      throw new Error("Get shelves returned invalid data!");
    }
    console.log("✅ Get shelves list verified.");

    // 6. Test delete question
    console.log("\n--- TEST 5: Question Deletion ---");
    const hash = QuestionShelfService.generateQuestionHash(q1.question_text);
    const deleted = await QuestionShelfService.deleteQuestion("Java", hash);
    console.log(`Deleted Java question: ${deleted} (Expected: true)`);

    // Verify folder deleted because it became empty
    const javaFolderExists = await fs.access(testJavaDir).then(() => true).catch(() => false);
    console.log(`Java folder still exists: ${javaFolderExists} (Expected: false)`);

    const dbJavaAfterDelete = await pool.query("SELECT COUNT(*)::int FROM question_bank WHERE category = 'Java'");
    console.log(`Java questions in DB after delete: ${dbJavaAfterDelete.rows[0].count} (Expected: 0)`);

    if (javaFolderExists || dbJavaAfterDelete.rows[0].count !== 0) {
      throw new Error("Deletion or empty folder cleanup failed!");
    }
    console.log("✅ Question deletion and auto-cleanup verified.");

    console.log("\n🎉 ALL SHELF SYSTEM TESTS PASSED SUCCESSFULLY! 🎉\n");
  } catch (error) {
    console.error("❌ Verification failed with error:", error);
  } finally {
    await pool.end();
  }
}

runVerification();
