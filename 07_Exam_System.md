# Feature: Exam System (Hệ thống thi và chấm điểm)

## Overview
Hệ thống thi trực tuyến với tính năng chấm điểm tự động, giới hạn thời gian, và anti-cheating.

## File Structure

### Backend Files (Tạo trong `/backend/`)

#### 1. `/backend/routers/exam.py`
**Nội dung:**
```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db
from models.user import User
from schemas.exam import ExamStart, ExamSubmit, ExamResult, ExamStatus
from services.exam_service import ExamService
from services.statistics_service import StatisticsService
from routers.auth import get_current_active_user

router = APIRouter(prefix="/exam", tags=["Exam"])

@router.post("/{quiz_id}/start", response_model=ExamStatus)
async def start_exam(
    quiz_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Start a new exam session."""
    exam_session = ExamService.start_exam(db, quiz_id, current_user)
    if not exam_session:
        raise HTTPException(status_code=400, detail="Cannot start exam")
    
    # Record activity
    StatisticsService.record_activity(
        db, current_user.id, "quiz_start", {"quiz_id": quiz_id}
    )
    
    return exam_session

@router.get("/{session_id}/status", response_model=ExamStatus)
async def get_exam_status(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get current exam status and remaining time."""
    status = ExamService.get_exam_status(db, session_id, current_user)
    if not status:
        raise HTTPException(status_code=404, detail="Exam session not found")
    return status

@router.post("/{session_id}/submit", response_model=ExamResult)
async def submit_exam(
    session_id: int,
    submit_data: ExamSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Submit exam answers."""
    result = ExamService.submit_exam(db, session_id, submit_data, current_user)
    if not result:
        raise HTTPException(status_code=400, detail="Cannot submit exam")
    
    # Record activity
    StatisticsService.record_activity(
        db, current_user.id, "quiz_complete", {
            "quiz_id": result.quiz_id,
            "score": result.score,
            "passed": result.passed
        }
    )
    
    return result

@router.post("/{session_id}/save-progress")
async def save_progress(
    session_id: int,
    answers: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Save exam progress (auto-save)."""
    success = ExamService.save_progress(db, session_id, answers, current_user)
    return {"saved": success}

@router.post("/{session_id}/abandon")
async def abandon_exam(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Abandon exam without submitting."""
    success = ExamService.abandon_exam(db, session_id, current_user)
    return {"abandoned": success}
```

#### 2. `/backend/services/exam_service.py`
**Nội dung:**
```python
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional, List, Dict
import json

from models.quiz import Quiz, Question
from models.statistics import QuizAttempt
from models.user import User
from schemas.exam import ExamSubmit, ExamResult, ExamStatus

class ExamService:
    
    @staticmethod
    def start_exam(db: Session, quiz_id: int, user: User) -> Optional[ExamStatus]:
        quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
        if not quiz or not quiz.is_active:
            return None
        
        # Check if exam is within time window
        if quiz.start_date and datetime.utcnow() < quiz.start_date:
            return None
        if quiz.end_date and datetime.utcnow() > quiz.end_date:
            return None
        
        # Check max attempts
        if quiz.max_attempts:
            attempt_count = db.query(QuizAttempt).filter(
                QuizAttempt.user_id == user.id,
                QuizAttempt.quiz_id == quiz_id,
                QuizAttempt.completed_at != None
            ).count()
            if attempt_count >= quiz.max_attempts:
                return None
        
        # Create exam session
        attempt = QuizAttempt(
            user_id=user.id,
            quiz_id=quiz_id,
            score=0,
            total_questions=quiz.total_questions,
            correct_answers=0,
            time_taken=0,
            started_at=datetime.utcnow()
        )
        db.add(attempt)
        db.commit()
        db.refresh(attempt)
        
        # Get questions (randomize if enabled)
        questions = db.query(Question).filter(
            Question.quiz_id == quiz_id,
            Question.is_active == True
        ).all()
        
        if quiz.shuffle_questions:
            import random
            questions = random.sample(questions, len(questions))
        
        return ExamStatus(
            session_id=attempt.id,
            quiz_id=quiz_id,
            quiz_title=quiz.title,
            started_at=attempt.started_at,
            time_limit=quiz.time_limit * 60,  # Convert to seconds
            total_questions=len(questions),
            questions=[{
                "id": q.id,
                "question_text": q.question_text,
                "question_type": q.question_type,
                "options": q.options if not quiz.shuffle_options else random.sample(q.options, len(q.options)),
                "media_url": q.media_url,
                "points": q.points,
                "time_limit": q.time_limit
            } for q in questions],
            saved_answers={}
        )
    
    @staticmethod
    def get_exam_status(db: Session, session_id: int, user: User) -> Optional[ExamStatus]:
        attempt = db.query(QuizAttempt).filter(
            QuizAttempt.id == session_id,
            QuizAttempt.user_id == user.id,
            QuizAttempt.completed_at == None
        ).first()
        
        if not attempt:
            return None
        
        quiz = attempt.quiz
        elapsed = (datetime.utcnow() - attempt.started_at).total_seconds()
        remaining = max(0, quiz.time_limit * 60 - elapsed)
        
        return ExamStatus(
            session_id=attempt.id,
            quiz_id=quiz.id,
            quiz_title=quiz.title,
            started_at=attempt.started_at,
            time_limit=quiz.time_limit * 60,
            time_remaining=int(remaining),
            total_questions=attempt.total_questions,
            questions=[],  # Don't return questions in status check
            saved_answers=json.loads(attempt.answers) if attempt.answers else {}
        )
    
    @staticmethod
    def submit_exam(db: Session, session_id: int, submit_data: ExamSubmit, user: User) -> Optional[ExamResult]:
        attempt = db.query(QuizAttempt).filter(
            QuizAttempt.id == session_id,
            QuizAttempt.user_id == user.id,
            QuizAttempt.completed_at == None
        ).first()
        
        if not attempt:
            return None
        
        quiz = attempt.quiz
        questions = {q.id: q for q in quiz.questions}
        
        # Calculate score
        correct_count = 0
        total_points = 0
        earned_points = 0
        question_results = []
        
        for answer in submit_data.answers:
            question = questions.get(answer.question_id)
            if not question:
                continue
            
            total_points += question.points
            
            is_correct = False
            if question.question_type == "MULTIPLE_CHOICE":
                is_correct = answer.answer == question.correct_answer
            elif question.question_type == "TRUE_FALSE":
                is_correct = answer.answer.lower() == question.correct_answer.lower()
            elif question.question_type == "SHORT_ANSWER":
                if question.case_sensitive:
                    is_correct = answer.answer == question.correct_answer
                else:
                    is_correct = answer.answer.lower() == question.correct_answer.lower()
            
            if is_correct:
                correct_count += 1
                earned_points += question.points
            elif quiz.negative_marking:
                earned_points -= quiz.penalty_per_wrong
            
            question_results.append({
                "question_id": question.id,
                "question_text": question.question_text,
                "user_answer": answer.answer,
                "correct_answer": question.correct_answer if quiz.show_answers else None,
                "is_correct": is_correct,
                "points": question.points if is_correct else 0,
                "explanation": question.explanation if quiz.show_answers else None
            })
        
        # Calculate percentage
        score = (earned_points / total_points * 100) if total_points > 0 else 0
        score = max(0, score)  # Don't go below 0
        
        # Update attempt
        time_taken = int((datetime.utcnow() - attempt.started_at).total_seconds())
        attempt.score = score
        attempt.correct_answers = correct_count
        attempt.time_taken = time_taken
        attempt.completed_at = datetime.utcnow()
        attempt.answers = json.dumps([a.dict() for a in submit_data.answers])
        db.commit()
        
        return ExamResult(
            attempt_id=attempt.id,
            quiz_id=quiz.id,
            quiz_title=quiz.title,
            score=round(score, 2),
            total_points=total_points,
            earned_points=earned_points,
            correct_answers=correct_count,
            total_questions=attempt.total_questions,
            time_taken=time_taken,
            passed=score >= quiz.passing_score,
            passing_score=quiz.passing_score,
            question_results=question_results,
            show_answers=quiz.show_answers,
            show_leaderboard=quiz.show_leaderboard,
            rank=None,  # Calculate if leaderboard enabled
            completed_at=attempt.completed_at
        )
    
    @staticmethod
    def save_progress(db: Session, session_id: int, answers: dict, user: User) -> bool:
        attempt = db.query(QuizAttempt).filter(
            QuizAttempt.id == session_id,
            QuizAttempt.user_id == user.id,
            QuizAttempt.completed_at == None
        ).first()
        
        if not attempt:
            return False
        
        attempt.answers = json.dumps(answers)
        db.commit()
        return True
    
    @staticmethod
    def abandon_exam(db: Session, session_id: int, user: User) -> bool:
        attempt = db.query(QuizAttempt).filter(
            QuizAttempt.id == session_id,
            QuizAttempt.user_id == user.id,
            QuizAttempt.completed_at == None
        ).first()
        
        if not attempt:
            return False
        
        # Mark as abandoned (completed with 0 score)
        attempt.score = 0
        attempt.completed_at = datetime.utcnow()
        db.commit()
        return True
```

### Frontend Files (Tạo trong `/frontend/src/`)

#### 3. `/frontend/src/pages/ExamPage.js`
**Nội dung:**
```javascript
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ExamTimer from '../components/exam/ExamTimer';
import QuestionCard from '../components/exam/QuestionCard';

const ExamPage = () => {
    const { quizId } = useParams();
    const navigate = useNavigate();
    const { token, user } = useAuth();
    const [examStatus, setExamStatus] = useState(null);
    const [answers, setAnswers] = useState({});
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [loading, setLoading] = useState(true);

    // Start exam
    useEffect(() => {
        startExam();
    }, []);

    const startExam = async () => {
        const response = await fetch(`/exam/${quizId}/start`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        setExamStatus(data);
        setLoading(false);
    };

    // Auto-save progress
    const saveProgress = useCallback(async () => {
        if (!examStatus) return;
        await fetch(`/exam/${examStatus.session_id}/save-progress`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(answers)
        });
    }, [examStatus, answers, token]);

    useEffect(() => {
        const interval = setInterval(saveProgress, 30000); // Auto-save every 30s
        return () => clearInterval(interval);
    }, [saveProgress]);

    const handleAnswer = (questionId, answer) => {
        setAnswers(prev => ({ ...prev, [questionId]: answer }));
    };

    const handleSubmit = async () => {
        const confirmed = window.confirm('Bạn chắc chắn muốn nộp bài?');
        if (!confirmed) return;

        const submitData = {
            answers: Object.entries(answers).map(([qid, ans]) => ({
                question_id: parseInt(qid),
                answer: ans
            }))
        };

        const response = await fetch(`/exam/${examStatus.session_id}/submit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(submitData)
        });

        const result = await response.json();
        navigate(`/exam/result/${result.attempt_id}`, { state: { result } });
    };

    const handleTimeUp = () => {
        alert('Hết thời gian! Bài thi sẽ được tự động nộp.');
        handleSubmit();
    };

    if (loading) return <div>Đang tải...</div>;
    if (!examStatus) return <div>Không thể bắt đầu bài thi</div>;

    const question = examStatus.questions[currentQuestion];

    return (
        <div className="exam-page">
            <div className="exam-header">
                <h1>{examStatus.quiz_title}</h1>
                <ExamTimer 
                    timeRemaining={examStatus.time_remaining}
                    onTimeUp={handleTimeUp}
                />
            </div>

            <div className="exam-progress">
                Câu {currentQuestion + 1} / {examStatus.total_questions}
            </div>

            <QuestionCard
                question={question}
                answer={answers[question.id]}
                onAnswer={(ans) => handleAnswer(question.id, ans)}
            />

            <div className="exam-navigation">
                <button
                    disabled={currentQuestion === 0}
                    onClick={() => setCurrentQuestion(prev => prev - 1)}
                >
                    Câu trước
                </button>
                
                {currentQuestion < examStatus.total_questions - 1 ? (
                    <button onClick={() => setCurrentQuestion(prev => prev + 1)}>
                        Câu tiếp theo
                    </button>
                ) : (
                    <button className="submit-btn" onClick={handleSubmit}>
                        Nộp bài
                    </button>
                )}
            </div>

            <div className="question-navigator">
                {examStatus.questions.map((q, idx) => (
                    <button
                        key={q.id}
                        className={`
                            ${idx === currentQuestion ? 'current' : ''}
                            ${answers[q.id] ? 'answered' : ''}
                        `}
                        onClick={() => setCurrentQuestion(idx)}
                    >
                        {idx + 1}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default ExamPage;
```

#### 4. `/frontend/src/components/exam/ExamTimer.js`
**Nội dung:**
```javascript
import React, { useState, useEffect } from 'react';

const ExamTimer = ({ timeRemaining, onTimeUp }) => {
    const [timeLeft, setTimeLeft] = useState(timeRemaining);

    useEffect(() => {
        setTimeLeft(timeRemaining);
    }, [timeRemaining]);

    useEffect(() => {
        if (timeLeft <= 0) {
            onTimeUp();
            return;
        }

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    onTimeUp();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [timeLeft, onTimeUp]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getColor = () => {
        if (timeLeft < 60) return 'red';     // Less than 1 minute
        if (timeLeft < 300) return 'orange'; // Less than 5 minutes
        return 'green';
    };

    return (
        <div className={`exam-timer ${getColor()}`}>
            ⏱️ {formatTime(timeLeft)}
        </div>
    );
};

export default ExamTimer;
```

## Dependencies Required

### Backend
```
# No additional dependencies needed
```

## API Endpoints Summary

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | /exam/{quiz_id}/start | Start exam | Authenticated |
| GET | /exam/{session_id}/status | Get exam status | Authenticated |
| POST | /exam/{session_id}/submit | Submit exam | Authenticated |
| POST | /exam/{session_id}/save-progress | Auto-save progress | Authenticated |
| POST | /exam/{session_id}/abandon | Abandon exam | Authenticated |

## Features
- **Timed exams**: Countdown timer with auto-submit
- **Auto-save**: Progress saved every 30 seconds
- **Question navigation**: Jump to any question
- **Anti-cheating**: Time limit enforcement
- **Multiple question types**: MCQ, True/False, Short answer
- **Negative marking**: Optional penalty for wrong answers
- **Instant results**: Score calculation on submission

## Testing Checklist
- [ ] Start exam successfully
- [ ] Timer counts down correctly
- [ ] Auto-save works
- [ ] Submit exam with answers
- [ ] Time-up auto-submit
- [ ] Calculate score correctly
- [ ] Show results with explanations
- [ ] Handle different question types
