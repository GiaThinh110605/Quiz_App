from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import auth
from pydantic import BaseModel
from typing import List

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Quiz App API", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include auth router
app.include_router(auth.router)

# Sample quiz data
QUESTIONS = [
    {
        "id": 1,
        "question": "React là thư viện của ngôn ngữ nào?",
        "options": ["Python", "JavaScript", "Java", "C#"],
        "correct_answer": "JavaScript"
    },
    {
        "id": 2,
        "question": "HTML là viết tắt của gì?",
        "options": ["Hyper Text Markup Language", "High Tech Modern Language", "Home Tool Markup Language", "Hyperlinks and Text Markup Language"],
        "correct_answer": "Hyper Text Markup Language"
    },
    {
        "id": 3,
        "question": "CSS dùng để làm gì?",
        "options": ["Lưu trữ dữ liệu", "Tạo kiểu cho trang web", "Xử lý logic", "Kết nối cơ sở dữ liệu"],
        "correct_answer": "Tạo kiểu cho trang web"
    },
    {
        "id": 4,
        "question": "JavaScript được tạo ra vào năm nào?",
        "options": ["1993", "1995", "1997", "2000"],
        "correct_answer": "1995"
    },
    {
        "id": 5,
        "question": "Trong React, 'props' là gì?",
        "options": ["Thuộc tính của component", "Hàm xử lý sự kiện", "State của component", "Router"],
        "correct_answer": "Thuộc tính của component"
    },
    {
        "id": 6,
        "question": "HTTP status code 200 có nghĩa là gì?",
        "options": ["Not Found", "Server Error", "OK", "Unauthorized"],
        "correct_answer": "OK"
    },
    {
        "id": 7,
        "question": "Git là gì?",
        "options": ["Ngôn ngữ lập trình", "Hệ điều hành", "Hệ thống quản lý phiên bản", "Cơ sở dữ liệu"],
        "correct_answer": "Hệ thống quản lý phiên bản"
    },
    {
        "id": 8,
        "question": "DOM là viết tắt của gì?",
        "options": ["Document Object Model", "Data Object Management", "Dynamic Object Model", "Document Oriented Model"],
        "correct_answer": "Document Object Model"
    }
]

# Pydantic models
class Answer(BaseModel):
    question_id: int
    selected_answer: str

class Submission(BaseModel):
    answers: List[Answer]

class Result(BaseModel):
    question_id: int
    question: str
    user_answer: str
    correct_answer: str
    is_correct: bool

class QuizResult(BaseModel):
    total_questions: int
    correct_answers: int
    score: float
    results: List[Result]

@app.get("/questions")
async def get_questions():
    """Get all quiz questions"""
    return QUESTIONS

@app.post("/submit", response_model=QuizResult)
async def submit_quiz(submission: Submission):
    """Submit quiz answers and get results"""
    correct_count = 0
    results = []
    
    # Create a dictionary of user answers for easy lookup
    user_answers = {answer.question_id: answer.selected_answer for answer in submission.answers}
    
    for question in QUESTIONS:
        user_answer = user_answers.get(question["id"], "")
        is_correct = user_answer == question["correct_answer"]
        
        if is_correct:
            correct_count += 1
        
        result = Result(
            question_id=question["id"],
            question=question["question"],
            user_answer=user_answer,
            correct_answer=question["correct_answer"],
            is_correct=is_correct
        )
        results.append(result)
    
    score = (correct_count / len(QUESTIONS)) * 100
    
    return QuizResult(
        total_questions=len(QUESTIONS),
        correct_answers=correct_count,
        score=score,
        results=results
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
