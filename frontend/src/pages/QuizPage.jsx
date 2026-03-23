import React, { useState, useEffect } from 'react';



const QuizPage = () => {
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState(null);
  const [quizStarted, setQuizStarted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchQuestions();
  }, []);

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
  };

  const handleAnswerSelect = (questionId, selectedAnswer) => {
    setAnswers(prev => ({ ...prev, [questionId]: selectedAnswer }));
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
        headers: { 'Content-Type': 'application/json' },
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

  const getScoreIcon = (score) => {
    if (score >= 80) return '🎉';
    if (score >= 60) return '👍';
    return '💪';
  };

  // Start Quiz Screen
  if (!quizStarted) {
    return (
      <div className="start-quiz-container">
        <div className="start-quiz-card">
          <h1>Ứng dụng Trắc nghiệm</h1>
          <p>Chào mừng bạn đến với bài trắc nghiệm kiến thức lập trình web! Hãy cùng thử thách bản thân nhé.</p>

          <div className="quiz-info">
            <div className="info-item">
              <div className="value">{questions.length}</div>
              <div className="label">Câu hỏi</div>
            </div>
            <div className="info-item">
              <div className="value">15</div>
              <div className="label">Phút</div>
            </div>
            <div className="info-item">
              <div className="value">100</div>
              <div className="label">Điểm</div>
            </div>
          </div>

          <button className="btn-primary" onClick={startQuiz}>
            Bắt đầu làm bài
          </button>
        </div>
      </div>
    );
  }

  // Results Screen
  if (showResults && results) {
    const scoreClass = getScoreClass(results.score);
    const scoreIcon = getScoreIcon(results.score);

    return (
      <div className="main-content">
        <div className="results-container">
          <div className="score-card">
            <div className="result-icon">{scoreIcon}</div>
            <div className={`score-display ${scoreClass}`}>
              <h2>{results.score.toFixed(0)}/100</h2>
              <p>Số câu đúng: {results.correct_answers}/{results.total_questions}</p>
            </div>
            <button className="btn-primary" onClick={startQuiz}>
              Làm lại bài thi
            </button>
          </div>

          <div className="result-details">
            <h3>Chi tiết kết quả</h3>
            {results.results.map((result) => (
              <div key={result.question_id} className={`result-item ${result.is_correct ? 'correct' : 'incorrect'}`}>
                <div className="result-question">
                  Câu {result.question_id}: {result.question}
                </div>
                <div className={`result-answer user-${result.is_correct ? 'correct' : 'incorrect'}`}>
                  Đáp án của bạn: {result.user_answer || '(Không trả lời)'}
                </div>
                {!result.is_correct && (
                  <div className="result-answer correct-answer">
                    Đáp án đúng: {result.correct_answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Loading
  if (questions.length === 0) {
    return (
      <div className="main-content">
        <div className="spinner"></div>
        <p style={{ textAlign: 'center', color: 'white' }}>Đang tải câu hỏi...</p>
      </div>
    );
  }

  // Quiz Question Screen
  const question = questions[currentQuestion];
  const selectedAnswer = answers[question.id];
  const progress = ((currentQuestion + 1) / questions.length) * 100;

  return (
    <div className="main-content">
      <div className="quiz-wrapper">
        <div className="quiz-header">
          <div className="quiz-title">Bài trắc nghiệm</div>
          <div className="quiz-progress">
            <span className="progress-text">Câu {currentQuestion + 1}/{questions.length}</span>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        </div>

        <div className="question-container">
          <div className="question-text">
            {question.question}
          </div>
          <div className="options-container">
            {question.options.map((option, index) => (
              <button
                key={index}
                className={`option-button ${selectedAnswer === option ? 'selected' : ''}`}
                onClick={() => handleAnswerSelect(question.id, option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="question-dots">
          {questions.map((q, idx) => (
            <button
              key={q.id}
              className={`question-dot ${idx === currentQuestion ? 'current' : ''} ${answers[q.id] ? 'answered' : ''}`}
              onClick={() => setCurrentQuestion(idx)}
            >
              {idx + 1}
            </button>
          ))}
        </div>

        <div className="quiz-navigation">
          {currentQuestion > 0 ? (
            <button className="nav-button prev" onClick={prevQuestion}>
              ← Câu trước
            </button>
          ) : <div></div>}

          {currentQuestion < questions.length - 1 ? (
            <button className="nav-button next" onClick={nextQuestion}>
              Câu tiếp theo →
            </button>
          ) : (
            <button
              className="nav-button submit"
              onClick={handleSubmit}
              disabled={loading || Object.keys(answers).length === 0}
            >
              {loading ? 'Đang nộp...' : 'Nộp bài ✓'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuizPage;
