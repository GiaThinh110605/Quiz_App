# Feature: Quiz Management (Quản lý câu hỏi và đề thi)

## Overview
Hệ thống quản lý đề thi và câu hỏi cho Quiz App bao gồm CRUD, import/export, và organization features.

## File Structure

### Backend Files (Tạo trong `/backend/`)

#### 1. `/backend/routers/quizzes.py`
**Nội dung:**
```python
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db
from models.user import User
from schemas.quiz import QuizCreate, QuizUpdate, QuizResponse, QuizFilter
from services.quiz_service import QuizService
from routers.auth import get_current_active_user, require_librarian

router = APIRouter(prefix="/quizzes", tags=["Quizzes"])

@router.get("/", response_model=List[QuizResponse])
async def list_quizzes(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    category: Optional[str] = None,
    difficulty: Optional[str] = None,
    search: Optional[str] = None,
    public_only: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List all quizzes with filtering."""
    filter_params = QuizFilter(
        category=category,
        difficulty=difficulty,
        search=search,
        public_only=public_only and current_user.role not in ["admin", "librarian"]
    )
    
    quizzes = QuizService.list_quizzes(db, skip, limit, filter_params, current_user)
    return quizzes

@router.get("/{quiz_id}", response_model=QuizResponse)
async def get_quiz(
    quiz_id: int,
    include_answers: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get quiz details."""
    quiz = QuizService.get_quiz(db, quiz_id, current_user)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    # Only show answers to creators or admins
    if include_answers and quiz.created_by != current_user.id and current_user.role not in ["admin", "librarian"]:
        raise HTTPException(status_code=403, detail="Cannot view answers")
    
    return quiz

@router.post("/", response_model=QuizResponse, status_code=status.HTTP_201_CREATED)
async def create_quiz(
    quiz_data: QuizCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_librarian)
):
    """Create new quiz."""
    quiz = QuizService.create_quiz(db, quiz_data, current_user.id)
    return quiz

@router.put("/{quiz_id}", response_model=QuizResponse)
async def update_quiz(
    quiz_id: int,
    quiz_data: QuizUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_librarian)
):
    """Update quiz."""
    quiz = QuizService.update_quiz(db, quiz_id, quiz_data, current_user)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz

@router.delete("/{quiz_id}")
async def delete_quiz(
    quiz_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_librarian)
):
    """Delete quiz."""
    success = QuizService.delete_quiz(db, quiz_id, current_user)
    if not success:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return {"message": "Quiz deleted successfully"}

@router.post("/{quiz_id}/duplicate")
async def duplicate_quiz(
    quiz_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_librarian)
):
    """Duplicate existing quiz."""
    new_quiz = QuizService.duplicate_quiz(db, quiz_id, current_user)
    if not new_quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return new_quiz

@router.get("/categories")
async def get_categories(db: Session = Depends(get_db)):
    """Get all quiz categories."""
    categories = QuizService.get_categories(db)
    return categories
```

#### 2. `/backend/routers/questions.py`
**Nội dung:**
```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models.user import User
from schemas.question import QuestionCreate, QuestionUpdate, QuestionResponse
from services.question_service import QuestionService
from routers.auth import get_current_active_user, require_librarian

router = APIRouter(prefix="/questions", tags=["Questions"])

@router.get("/quiz/{quiz_id}", response_model=List[QuestionResponse])
async def get_quiz_questions(
    quiz_id: int,
    for_exam: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get questions for a quiz."""
    questions = QuestionService.get_quiz_questions(db, quiz_id, for_exam, current_user)
    return questions

@router.post("/quiz/{quiz_id}", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
async def create_question(
    quiz_id: int,
    question_data: QuestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_librarian)
):
    """Add question to quiz."""
    question = QuestionService.create_question(db, quiz_id, question_data, current_user)
    if not question:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return question

@router.put("/{question_id}", response_model=QuestionResponse)
async def update_question(
    question_id: int,
    question_data: QuestionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_librarian)
):
    """Update question."""
    question = QuestionService.update_question(db, question_id, question_data, current_user)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return question

@router.delete("/{question_id}")
async def delete_question(
    question_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_librarian)
):
    """Delete question."""
    success = QuestionService.delete_question(db, question_id, current_user)
    if not success:
        raise HTTPException(status_code=404, detail="Question not found")
    return {"message": "Question deleted successfully"}

@router.post("/import")
async def import_questions(
    quiz_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_librarian)
):
    """Import questions from CSV/Excel."""
    result = QuestionService.import_questions(db, quiz_id, file, current_user)
    return result
```

#### 3. `/backend/services/quiz_service.py`
**Nội dung:**
```python
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import List, Optional
from datetime import datetime

from models.quiz import Quiz, Question
from models.user import User
from schemas.quiz import QuizCreate, QuizUpdate, QuizFilter

class QuizService:
    
    @staticmethod
    def list_quizzes(
        db: Session, 
        skip: int = 0, 
        limit: int = 20,
        filter_params: Optional[QuizFilter] = None,
        current_user: Optional[User] = None
    ) -> List[Quiz]:
        query = db.query(Quiz)
        
        # Apply filters
        if filter_params:
            if filter_params.category:
                query = query.filter(Quiz.category == filter_params.category)
            if filter_params.difficulty:
                query = query.filter(Quiz.difficulty == filter_params.difficulty)
            if filter_params.search:
                search_term = f"%{filter_params.search}%"
                query = query.filter(
                    or_(
                        Quiz.title.ilike(search_term),
                        Quiz.description.ilike(search_term),
                        Quiz.tags.any(search_term)
                    )
                )
            if filter_params.public_only:
                query = query.filter(Quiz.public_access == True)
        
        # Non-admin users can only see their own or public quizzes
        if current_user and current_user.role not in ["admin", "librarian"]:
            query = query.filter(
                or_(
                    Quiz.public_access == True,
                    Quiz.created_by == current_user.id,
                    Quiz.allowed_users.contains([current_user.id])
                )
            )
        
        return query.offset(skip).limit(limit).all()
    
    @staticmethod
    def get_quiz(db: Session, quiz_id: int, current_user: Optional[User] = None) -> Optional[Quiz]:
        quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
        
        if quiz and current_user:
            # Check access permission
            if not quiz.public_access and \
               quiz.created_by != current_user.id and \
               current_user.id not in (quiz.allowed_users or []) and \
               current_user.role not in ["admin", "librarian"]:
                return None
        
        return quiz
    
    @staticmethod
    def create_quiz(db: Session, quiz_data: QuizCreate, user_id: int) -> Quiz:
        quiz = Quiz(
            **quiz_data.dict(),
            created_by=user_id,
            created_at=datetime.utcnow()
        )
        db.add(quiz)
        db.commit()
        db.refresh(quiz)
        return quiz
    
    @staticmethod
    def update_quiz(db: Session, quiz_id: int, quiz_data: QuizUpdate, current_user: User) -> Optional[Quiz]:
        quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
        
        if not quiz:
            return None
        
        # Check permission
        if quiz.created_by != current_user.id and current_user.role not in ["admin", "librarian"]:
            return None
        
        update_dict = quiz_data.dict(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(quiz, field, value)
        
        quiz.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(quiz)
        return quiz
    
    @staticmethod
    def delete_quiz(db: Session, quiz_id: int, current_user: User) -> bool:
        quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
        
        if not quiz:
            return False
        
        if quiz.created_by != current_user.id and current_user.role not in ["admin", "librarian"]:
            return False
        
        db.delete(quiz)
        db.commit()
        return True
    
    @staticmethod
    def duplicate_quiz(db: Session, quiz_id: int, current_user: User) -> Optional[Quiz]:
        original = db.query(Quiz).filter(Quiz.id == quiz_id).first()
        if not original:
            return None
        
        # Create copy
        new_quiz = Quiz(
            title=f"{original.title} (Copy)",
            description=original.description,
            category=original.category,
            difficulty=original.difficulty,
            time_limit=original.time_limit,
            passing_score=original.passing_score,
            shuffle_questions=original.shuffle_questions,
            show_answers=original.show_answers,
            created_by=current_user.id,
            is_active=False  # Draft state
        )
        db.add(new_quiz)
        db.commit()
        db.refresh(new_quiz)
        
        # Copy questions
        for question in original.questions:
            new_question = Question(
                quiz_id=new_quiz.id,
                question_text=question.question_text,
                question_type=question.question_type,
                options=question.options,
                correct_answer=question.correct_answer,
                explanation=question.explanation,
                points=question.points,
                order=question.order
            )
            db.add(new_question)
        
        db.commit()
        return new_quiz
    
    @staticmethod
    def get_categories(db: Session) -> List[str]:
        categories = db.query(Quiz.category).distinct().all()
        return [c[0] for c in categories if c[0]]
```

### Frontend Files (Tạo trong `/frontend/src/`)

#### 4. `/frontend/src/pages/QuizListPage.js`
**Nội dung:**
```javascript
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import QuizCard from '../components/quiz/QuizCard';
import QuizFilters from '../components/quiz/QuizFilters';

const QuizListPage = () => {
    const { token, user } = useAuth();
    const [quizzes, setQuizzes] = useState([]);
    const [filters, setFilters] = useState({
        category: '',
        difficulty: '',
        search: ''
    });

    useEffect(() => {
        fetchQuizzes();
    }, [filters]);

    const fetchQuizzes = async () => {
        const queryParams = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value) queryParams.append(key, value);
        });

        const response = await fetch(`/quizzes/?${queryParams}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        setQuizzes(data);
    };

    return (
        <div className="quiz-list-page">
            <h1>Danh sách đề thi</h1>
            <QuizFilters filters={filters} onChange={setFilters} />
            <div className="quiz-grid">
                {quizzes.map(quiz => (
                    <QuizCard key={quiz.id} quiz={quiz} />
                ))}
            </div>
        </div>
    );
};

export default QuizListPage;
```

#### 5. `/frontend/src/components/quiz/QuizCard.js`
**Nội dung:**
```javascript
import React from 'react';
import { Link } from 'react-router-dom';

const QuizCard = ({ quiz }) => {
    const difficultyColors = {
        easy: 'green',
        medium: 'yellow',
        hard: 'red'
    };

    return (
        <div className="quiz-card">
            <div className="quiz-header">
                <h3>{quiz.title}</h3>
                <span className={`difficulty ${difficultyColors[quiz.difficulty]}`}>
                    {quiz.difficulty}
                </span>
            </div>
            <p className="description">{quiz.description}</p>
            <div className="quiz-meta">
                <span>⏱️ {quiz.time_limit} phút</span>
                <span>📝 {quiz.total_questions} câu</span>
                <span>📁 {quiz.category}</span>
            </div>
            <div className="quiz-actions">
                <Link to={`/quiz/${quiz.id}`} className="btn-primary">
                    Bắt đầu
                </Link>
                <Link to={`/quiz/${quiz.id}/details`} className="btn-secondary">
                    Chi tiết
                </Link>
            </div>
        </div>
    );
};

export default QuizCard;
```

## Dependencies Required

### Backend
```
pandas==2.0.3
openpyxl==3.1.2
```

## API Endpoints Summary

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | /quizzes/ | List quizzes | Authenticated |
| GET | /quizzes/{id} | Get quiz | Authenticated |
| POST | /quizzes/ | Create quiz | Librarian+ |
| PUT | /quizzes/{id} | Update quiz | Librarian+ |
| DELETE | /quizzes/{id} | Delete quiz | Librarian+ |
| POST | /quizzes/{id}/duplicate | Duplicate quiz | Librarian+ |
| GET | /quizzes/categories | Get categories | Authenticated |

## Testing Checklist
- [ ] List quizzes with filters
- [ ] View quiz details
- [ ] Create new quiz
- [ ] Update quiz
- [ ] Delete quiz
- [ ] Duplicate quiz
- [ ] Manage questions
- [ ] Import questions from file
