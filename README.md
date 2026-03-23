# Quiz App

Ứng dụng trắc nghiệm đơn giản với FastAPI backend và React frontend.

## Cấu trúc dự án

```
QuizApp/
├── backend/
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.js
│   │   ├── App.css
│   │   ├── index.js
│   │   └── index.css
│   └── package.json
└── README.md
```

## Cài đặt và chạy

### Backend (FastAPI)

1. Di chuyển vào thư mục backend:
```bash
cd backend
```

2. Cài đặt dependencies:
```bash
pip install -r requirements.txt
```

3. Chạy server:
```bash
python main.py
```

Backend sẽ chạy tại `http://localhost:8000`

### Frontend (React)

1. Di chuyển vào thư mục frontend:
```bash
cd frontend
```

2. Cài đặt dependencies:
```bash
npm install
```

3. Chạy development server:
```bash
npm start
```

Frontend sẽ chạy tại `http://localhost:3000`

## API Endpoints

### GET /questions
Lấy danh sách tất cả câu hỏi trắc nghiệm.

**Response:**
```json
[
  {
    "id": 1,
    "question": "React là thư viện của ngôn ngữ nào?",
    "options": ["Python", "JavaScript", "Java", "C#"],
    "correct_answer": "JavaScript"
  }
]
```

### POST /submit
Nộp bài và nhận kết quả chấm điểm.

**Request Body:**
```json
{
  "answers": [
    {
      "question_id": 1,
      "selected_answer": "JavaScript"
    }
  ]
}
```

**Response:**
```json
{
  "total_questions": 8,
  "correct_answers": 7,
  "score": 87.5,
  "results": [
    {
      "question_id": 1,
      "question": "React là thư viện của ngôn ngữ nào?",
      "user_answer": "JavaScript",
      "correct_answer": "JavaScript",
      "is_correct": true
    }
  ]
}
```

## Tính năng

- ✅ Hiển thị danh sách câu hỏi (8 câu hỏi về lập trình web)
- ✅ Cho phép người dùng chọn đáp án
- ✅ Điều hướng giữa các câu hỏi
- ✅ Nộp bài và tính điểm tự động
- ✅ Hiển thị kết quả chi tiết (số câu đúng, điểm số, đáp án đúng/sai từng câu)
- ✅ Giao diện responsive và thân thiện
- ✅ Hỗ trợ tiếng Việt

## Công nghệ sử dụng

- **Backend**: FastAPI, Pydantic
- **Frontend**: React, CSS3
- **CORS**: Đã cấu hình cho phép frontend gọi API
