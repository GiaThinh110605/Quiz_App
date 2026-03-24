Chỉnh App.js
import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState(null);
  const [quizStarted, setQuizStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds
  const [isTimeUp, setIsTimeUp] = useState(false);

  useEffect(() => {
    fetchQuestions();
  }, []);

  useEffect(() => {
    let timer;
    if (quizStarted && !showResults && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prevTime) => {
          if (prevTime <= 1) {
            setIsTimeUp(true);
            handleSubmit();
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [quizStarted, showResults, timeLeft]);

  const fetchQuestions = async () => {
    try {
      const response = await fetch('/questions');
      const data = await response.json();
      setQuestions(data);
    } catch (error) {
      console.error('Error fetching questions:', error);
    }
  };

  const startQuiz = () => {
    setQuizStarted(true);
    setCurrentQuestion(0);
    setAnswers({});
    setShowResults(false);
    setResults(null);
    setTimeLeft(600); // Reset to 10 minutes
    setIsTimeUp(false);
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleAnswerSelect = (questionId, selectedAnswer) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: selectedAnswer
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const submission = {
        answers: Object.entries(answers).map(([questionId, selectedAnswer]) => ({
          question_id: parseInt(questionId),
          selected_answer: selectedAnswer
        }))
      };

      const response = await fetch('/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submission),
      });

      const result = await response.json();
      setResults(result);
      setShowResults(true);
    } catch (error) {
      console.error('Error submitting quiz:', error);
    } finally {
      setLoading(false);
    }
  };

  const nextQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const prevQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const getScoreClass = (score) => {
    if (score >= 80) return 'good';
    if (score >= 60) return 'medium';
    return 'poor';
  };

  if (!quizStarted) {
    return (
      <div className="App">
        <div className="quiz-container">
          <h1>Ứng dụng Trắc nghiệm</h1>
          <p>Chào mừng bạn đến với bài trắc nghiệm!</p>
          <p>Bạn sẽ trả lời {questions.length} câu hỏi về lập trình web.</p>
          <button className="start-button" onClick={startQuiz}>
            Bắt đầu làm bài
          </button>
        </div>
      </div>
    );
  }

  if (showResults && results) {
    return (
      <div className="App">
        <div className="quiz-container">
          <h1>Kết quả bài thi</h1>
          <div className={`score-display ${getScoreClass(results.score)}`}>
            <h2>Điểm số: {results.score.toFixed(1)}/100</h2>
            <p>Số câu đúng: {results.correct_answers}/{results.total_questions}</p>
          </div>

          <div className="results-container">
            <h2>Chi tiết kết quả</h2>
            {results.results.map((result) => (
              <div
                key={result.question_id}
                className={`result-item ${result.is_correct ? 'correct' : 'incorrect'}`}
              >
                <div className="result-question">
                  Câu {result.question_id}: {result.question}
                </div>
                <div className="result-answers">
                  <div className={`answer ${result.is_correct ? 'correct-answer' : 'incorrect-answer'}`}>
                    Đáp án của bạn: {result.user_answer || '(Không trả lời)'}
                  </div>
                  {!result.is_correct && (
                    <div className="correct-answer">
                      Đáp án đúng: {result.correct_answer}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button className="restart-button" onClick={startQuiz}>
            Làm lại bài thi
          </button>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="App">
        <div className="quiz-container">
          <h1>Đang tải câu hỏi...</h1>
        </div>
      </div>
    );
  }

  const question = questions[currentQuestion];
  const selectedAnswer = answers[question.id];

  return (
    <div className="App">
      <div className="quiz-container">
        <h1>Ứng dụng Trắc nghiệm</h1>

        {/* Timer Display */}
        <div className={`timer ${timeLeft <= 60 ? 'warning' : ''} ${isTimeUp ? 'time-up' : ''}`}>
          <span className="timer-label">⏱️ Thời gian còn lại:</span>
          <span className="timer-value">{formatTime(timeLeft)}</span>
          {isTimeUp && <span className="time-up-message">Hết giờ!</span>}
        </div>

        <div className="progress">
          <p>Câu {currentQuestion + 1}/{questions.length}</p>
        </div>

        <div className="question-card">
          <div className="question-text">
            {question.question}
          </div>
          <div className="options-container">
            {question.options.map((option, index) => (
              <button
                key={index}
                className={`option-button ${selectedAnswer === option ? 'selected' : ''}`}
                onClick={() => handleAnswerSelect(question.id, option)}
                disabled={showResults || isTimeUp}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="navigation">
          {currentQuestion > 0 && (
            <button
              className="submit-button"
              onClick={prevQuestion}
              disabled={isTimeUp}
            >
              Câu trước
            </button>
          )}

          {currentQuestion < questions.length - 1 ? (
            <button
              className="submit-button"
              onClick={nextQuestion}
              disabled={isTimeUp}
            >
              Câu tiếp theo
            </button>
          ) : (
            <button
              className="submit-button"
              onClick={handleSubmit}
              disabled={loading || Object.keys(answers).length === 0 || isTimeUp}
            >
              {loading ? 'Đang nộp bài...' : isTimeUp ? 'Hết giờ' : 'Nộp bài'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;

Thêm index.css 

/* Timer Styles */
.timer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #f8f9fa;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  padding: 15px 20px;
  margin: 20px 0;
  font-size: 18px;
  font-weight: 600;
  transition: all 0.3s ease;
}

.timer-label {
  color: #495057;
}

.timer-value {
  color: #28a745;
  font-size: 24px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
}

.timer.warning {
  border-color: #ffc107;
  background-color: #fff3cd;
}

.timer.warning .timer-value {
  color: #856404;
  animation: pulse 1s infinite;
}

.timer.time-up {
  border-color: #dc3545;
  background-color: #f8d7da;
}

.timer.time-up .timer-value {
  color: #721c24;
}

.time-up-message {
  color: #dc3545;
  font-weight: 700;
  margin-left: 10px;
  animation: blink 1s infinite;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }

  100% {
    opacity: 1;
  }
}

@keyframes blink {
  0% {
    opacity: 1;
  }

  50% {
    opacity: 0.3;
  }

  100% {
    opacity: 1;
  }
}