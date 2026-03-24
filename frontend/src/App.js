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
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [questionsError, setQuestionsError] = useState(null);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds
  const [isTimeUp, setIsTimeUp] = useState(false);

  useEffect(() => {
    fetchQuestions();
  }, []);

  // Add page reload warning
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (quizStarted && !showResults) {
        e.preventDefault();
        e.returnValue = 'Bạn có dữ liệu chưa được lưu. Bạn có chắc muốn rời đi?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [quizStarted, showResults]);

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
    setQuestionsLoading(true);
    setQuestionsError(null);
    try {
      const response = await fetch('/questions');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setQuestions(data);
    } catch (error) {
      console.error('Error fetching questions:', error);
      setQuestionsError('Không thể tải câu hỏi. Vui lòng làm mới trang.');
    } finally {
      setQuestionsLoading(false);
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
    // Check if all questions are answered and show confirmation
    const unansweredCount = questions.length - Object.keys(answers).length;
    if (unansweredCount > 0 && !isTimeUp) {
      const confirmSubmit = window.confirm(
        `Bạn còn ${unansweredCount} câu chưa trả lời. Bạn có chắc muốn nộp bài không?`
      );
      if (!confirmSubmit) {
        return;
      }
    } else if (!isTimeUp) {
      // All questions answered, still ask for final confirmation
      const confirmFinal = window.confirm(
        'Bạn có chắc chắn muốn nộp bài? Sau khi nộp sẽ không thể thay đổi.'
      );
      if (!confirmFinal) {
        return;
      }
    }

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

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setResults(result);
      setShowResults(true);
    } catch (error) {
      console.error('Error submitting quiz:', error);
      alert('Lỗi khi nộp bài: ' + (error.message || 'Vui lòng thử lại sau.'));
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

  if (questionsLoading) {
    return (
      <div className="App">
        <div className="quiz-container">
          <h1>Ứng dụng Trắc nghiệm</h1>
          <div className="loading">⏳ Đang tải câu hỏi...</div>
        </div>
      </div>
    );
  }

  if (questionsError) {
    return (
      <div className="App">
        <div className="quiz-container">
          <h1>Ứng dụng Trắc nghiệm</h1>
          <div className="error-message">
            ❌ {questionsError}
            <button onClick={fetchQuestions} className="retry-button">Thử lại</button>
          </div>
        </div>
      </div>
    );
  }

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
              disabled={loading || isTimeUp}
            >
              {loading ? 'Đang nộp bài...' : isTimeUp ? 'Hết giờ' : `Nộp bài (${Object.keys(answers).length}/${questions.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
