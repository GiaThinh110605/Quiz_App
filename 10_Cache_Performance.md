# Feature: Cache & Performance (Cache và Tối ưu hiệu năng)

## Overview
Hệ thống cache và tối ưu hiệu năng cho Quiz App sử dụng Redis và các kỹ thuật caching.

## File Structure

### Backend Files (Tạo trong `/backend/`)

#### 1. `/backend/core/cache.py`
**Nội dung:**
```python
import redis
import json
import pickle
from typing import Any, Optional, List
from functools import wraps
import hashlib
import os

# Redis configuration
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)

class CacheManager:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.redis_client = redis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                db=REDIS_DB,
                password=REDIS_PASSWORD,
                decode_responses=False,
                socket_connect_timeout=5,
                socket_timeout=5,
                health_check_interval=30
            )
        return cls._instance
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        try:
            value = self.redis_client.get(key)
            if value:
                return pickle.loads(value)
            return None
        except redis.RedisError as e:
            print(f"Cache get error: {e}")
            return None
    
    def set(self, key: str, value: Any, expire: int = 3600) -> bool:
        """Set value in cache with expiration (seconds)."""
        try:
            serialized = pickle.dumps(value)
            self.redis_client.setex(key, expire, serialized)
            return True
        except redis.RedisError as e:
            print(f"Cache set error: {e}")
            return False
    
    def delete(self, key: str) -> bool:
        """Delete key from cache."""
        try:
            self.redis_client.delete(key)
            return True
        except redis.RedisError as e:
            print(f"Cache delete error: {e}")
            return False
    
    def delete_pattern(self, pattern: str) -> int:
        """Delete all keys matching pattern."""
        try:
            keys = self.redis_client.keys(pattern)
            if keys:
                return self.redis_client.delete(*keys)
            return 0
        except redis.RedisError as e:
            print(f"Cache delete pattern error: {e}")
            return 0
    
    def exists(self, key: str) -> bool:
        """Check if key exists."""
        try:
            return self.redis_client.exists(key) > 0
        except redis.RedisError:
            return False
    
    def increment(self, key: str, amount: int = 1) -> int:
        """Increment counter."""
        try:
            return self.redis_client.incrby(key, amount)
        except redis.RedisError as e:
            print(f"Cache increment error: {e}")
            return 0
    
    def expire(self, key: str, seconds: int) -> bool:
        """Set expiration on key."""
        try:
            return self.redis_client.expire(key, seconds)
        except redis.RedisError:
            return False
    
    def ttl(self, key: str) -> int:
        """Get time to live of key."""
        try:
            return self.redis_client.ttl(key)
        except redis.RedisError:
            return -2
    
    def flush_all(self) -> bool:
        """Clear all cache."""
        try:
            self.redis_client.flushall()
            return True
        except redis.RedisError as e:
            print(f"Cache flush error: {e}")
            return False

# Global cache instance
cache = CacheManager()

# Cache decorators
def cached(key_prefix: str, expire: int = 3600):
    """Decorator to cache function results."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = f"{key_prefix}:{func.__name__}:{str(args)}:{str(kwargs)}"
            cache_key = hashlib.md5(cache_key.encode()).hexdigest()
            
            # Try to get from cache
            cached_value = cache.get(cache_key)
            if cached_value is not None:
                return cached_value
            
            # Execute function
            result = func(*args, **kwargs)
            
            # Store in cache
            cache.set(cache_key, result, expire)
            
            return result
        return wrapper
    return decorator

def cache_delete_pattern(pattern: str):
    """Decorator to invalidate cache after function execution."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            result = func(*args, **kwargs)
            cache.delete_pattern(pattern)
            return result
        return wrapper
    return decorator
```

#### 2. `/backend/core/rate_limiter.py`
**Nội dung:**
```python
import time
from functools import wraps
from fastapi import HTTPException, Request
from typing import Optional

from core.cache import cache

class RateLimiter:
    """Rate limiting using sliding window algorithm."""
    
    def __init__(self, requests: int, window: int):
        self.requests = requests  # Number of requests allowed
        self.window = window      # Time window in seconds
    
    def is_allowed(self, key: str) -> tuple[bool, int]:
        """Check if request is allowed and return remaining quota."""
        current_time = int(time.time())
        window_start = current_time - self.window
        
        cache_key = f"rate_limit:{key}"
        
        # Get request timestamps
        timestamps = cache.get(cache_key) or []
        
        # Remove old timestamps
        timestamps = [ts for ts in timestamps if ts > window_start]
        
        # Check if limit exceeded
        if len(timestamps) >= self.requests:
            retry_after = timestamps[0] + self.window - current_time
            return False, retry_after
        
        # Add current timestamp
        timestamps.append(current_time)
        cache.set(cache_key, timestamps, self.window)
        
        remaining = self.requests - len(timestamps)
        return True, remaining

# Predefined rate limiters
login_limiter = RateLimiter(requests=5, window=300)      # 5 login attempts per 5 minutes
api_limiter = RateLimiter(requests=100, window=60)       # 100 API calls per minute
quiz_submit_limiter = RateLimiter(requests=10, window=60) # 10 quiz submissions per minute

def rate_limit(limiter: RateLimiter, key_func=None):
    """Decorator for rate limiting."""
    def decorator(func):
        @wraps(func)
        async def wrapper(request: Request, *args, **kwargs):
            # Generate key
            if key_func:
                key = key_func(request)
            else:
                key = request.client.host
            
            allowed, remaining = limiter.is_allowed(key)
            
            if not allowed:
                raise HTTPException(
                    status_code=429,
                    detail="Too many requests",
                    headers={"Retry-After": str(remaining)}
                )
            
            return await func(request, *args, **kwargs)
        return wrapper
    return decorator
```

#### 3. `/backend/services/quiz_cache_service.py`
**Nội dung:**
```python
from typing import List, Optional
from sqlalchemy.orm import Session
from core.cache import cache, cached, cache_delete_pattern
from models.quiz import Quiz, Question
from schemas.quiz import QuizResponse

class QuizCacheService:
    """Cache layer for quiz operations."""
    
    CACHE_PREFIX = "quiz"
    CACHE_EXPIRE = 3600  # 1 hour
    
    @staticmethod
    def get_cache_key(quiz_id: int, include_answers: bool = False) -> str:
        return f"{QuizCacheService.CACHE_PREFIX}:{quiz_id}:answers_{include_answers}"
    
    @staticmethod
    @cached(key_prefix="quiz_list", expire=1800)
    def get_cached_quiz_list(
        db: Session, skip: int, limit: int, category: Optional[str], 
        difficulty: Optional[str]
    ) -> List[QuizResponse]:
        """Get quiz list with caching."""
        from services.quiz_service import QuizService
        
        quizzes = QuizService.list_quizzes(db, skip, limit, category, difficulty)
        return [QuizResponse.from_orm(q) for q in quizzes]
    
    @staticmethod
    def get_cached_quiz(db: Session, quiz_id: int, include_answers: bool = False) -> Optional[Quiz]:
        """Get quiz with caching."""
        cache_key = QuizCacheService.get_cache_key(quiz_id, include_answers)
        
        # Try cache
        cached_quiz = cache.get(cache_key)
        if cached_quiz:
            return cached_quiz
        
        # Get from database
        from services.quiz_service import QuizService
        quiz = QuizService.get_quiz(db, quiz_id)
        
        if quiz:
            # Cache quiz data
            cache.set(cache_key, quiz, QuizCacheService.CACHE_EXPIRE)
        
        return quiz
    
    @staticmethod
    def invalidate_quiz_cache(quiz_id: int):
        """Invalidate quiz cache when updated."""
        pattern = f"{QuizCacheService.CACHE_PREFIX}:{quiz_id}:*"
        cache.delete_pattern(pattern)
        
        # Also invalidate list cache
        cache.delete_pattern("quiz_list:*")
    
    @staticmethod
    def get_cached_questions(db: Session, quiz_id: int) -> List[Question]:
        """Get questions with caching."""
        cache_key = f"{QuizCacheService.CACHE_PREFIX}:{quiz_id}:questions"
        
        # Try cache
        cached_questions = cache.get(cache_key)
        if cached_questions:
            return cached_questions
        
        # Get from database
        from services.question_service import QuestionService
        questions = QuestionService.get_quiz_questions(db, quiz_id, for_exam=False)
        
        # Cache questions
        cache.set(cache_key, questions, QuizCacheService.CACHE_EXPIRE)
        
        return questions
    
    @staticmethod
    def get_popular_quizzes(db: Session, limit: int = 10) -> List[dict]:
        """Get popular quizzes with caching."""
        cache_key = f"{QuizCacheService.CACHE_PREFIX}:popular:{limit}"
        
        cached = cache.get(cache_key)
        if cached:
            return cached
        
        # Get from database
        from sqlalchemy import func, desc
        popular = db.query(
            Quiz.id,
            Quiz.title,
            func.count(QuizAttempt.id).label('attempt_count')
        ).join(QuizAttempt).group_by(Quiz.id).order_by(desc('attempt_count')).limit(limit).all()
        
        result = [
            {"id": q.id, "title": q.title, "attempts": q.attempt_count}
            for q in popular
        ]
        
        # Cache for 30 minutes
        cache.set(cache_key, result, 1800)
        
        return result

# Cache invalidation on model changes
def invalidate_on_quiz_change(func):
    """Decorator to invalidate quiz cache after modification."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        result = func(*args, **kwargs)
        
        # Get quiz_id from arguments
        quiz_id = kwargs.get('quiz_id') or (args[1] if len(args) > 1 else None)
        if quiz_id:
            QuizCacheService.invalidate_quiz_cache(quiz_id)
        
        return result
    return wrapper
```

#### 4. `/backend/middleware/cache_middleware.py`
**Nội dung:**
```python
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Callable
import hashlib
import json

from core.cache import cache

class CacheMiddleware(BaseHTTPMiddleware):
    """Middleware for caching API responses."""
    
    def __init__(self, app, cache_paths: list = None, expire: int = 300):
        super().__init__(app)
        self.cache_paths = cache_paths or ["/quizzes", "/questions"]
        self.expire = expire
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Only cache GET requests
        if request.method != "GET":
            return await call_next(request)
        
        # Check if path should be cached
        should_cache = any(request.url.path.startswith(path) for path in self.cache_paths)
        if not should_cache:
            return await call_next(request)
        
        # Generate cache key
        cache_key = self._generate_cache_key(request)
        
        # Try to get from cache
        cached_response = cache.get(cache_key)
        if cached_response:
            return Response(
                content=cached_response["body"],
                status_code=cached_response["status_code"],
                headers=cached_response["headers"]
            )
        
        # Execute request
        response = await call_next(request)
        
        # Cache successful responses
        if response.status_code == 200:
            body = b""
            async for chunk in response.body_iterator:
                body += chunk
            
            # Store in cache
            cache_data = {
                "body": body,
                "status_code": response.status_code,
                "headers": dict(response.headers)
            }
            cache.set(cache_key, cache_data, self.expire)
            
            # Return new response
            return Response(content=body, status_code=response.status_code, headers=dict(response.headers))
        
        return response
    
    def _generate_cache_key(self, request: Request) -> str:
        """Generate unique cache key for request."""
        key_data = f"{request.method}:{request.url.path}:{request.query_params}"
        return f"api_cache:{hashlib.md5(key_data.encode()).hexdigest()}"
```

### Configuration Files

#### 5. `/backend/config/redis.conf`
**Nội dung:**
```conf
# Redis configuration for Quiz App

# Memory management
maxmemory 256mb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000

# Logging
loglevel notice

# Security
# requirepass your_password_here

# Performance
tcp-keepalive 300
timeout 0
tcp-backlog 511
```

#### 6. `/backend/scripts/clear_cache.py`
**Nội dung:**
```python
#!/usr/bin/env python3
"""Script to clear cache."""

import argparse
from core.cache import cache

def main():
    parser = argparse.ArgumentParser(description='Cache management')
    parser.add_argument('--pattern', type=str, default='*', help='Pattern to match keys')
    parser.add_argument('--all', action='store_true', help='Clear all cache')
    
    args = parser.parse_args()
    
    if args.all:
        confirm = input("Are you sure you want to clear ALL cache? (yes/no): ")
        if confirm.lower() == 'yes':
            cache.flush_all()
            print("All cache cleared.")
        else:
            print("Cancelled.")
    else:
        count = cache.delete_pattern(args.pattern)
        print(f"Deleted {count} keys matching pattern '{args.pattern}'")

if __name__ == "__main__":
    main()
```

## Docker Compose Configuration

#### 7. `docker-compose.yml` (Redis service)
**Nội dung:**
```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: quizapp_redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
      - ./backend/config/redis.conf:/usr/local/etc/redis/redis.conf
    command: redis-server /usr/local/etc/redis/redis.conf
    restart: unless-stopped
    
  backend:
    # ... other backend config
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_DB=0
    depends_on:
      - redis
      - db

volumes:
  redis_data:
```

## Dependencies Required

### Backend
```
redis==5.0.1
```

## Cache Strategies

### 1. Read-Through Cache
- Data loaded into cache on first access
- Subsequent reads served from cache
- TTL-based expiration

### 2. Write-Through Cache
- Data written to cache and database simultaneously
- Ensures consistency

### 3. Cache-Aside (Lazy Loading)
- Application checks cache first
- Loads from DB if cache miss
- Updates cache after DB read

### 4. Write-Behind (Write-Back)
- Data written to cache first
- Asynchronously written to database
- Better performance, risk of data loss

## Performance Metrics

### Cache Hit Rate
```python
# Track cache performance
cache_stats = {
    'hits': 0,
    'misses': 0,
    'evictions': 0
}

hit_rate = cache_stats['hits'] / (cache_stats['hits'] + cache_stats['misses'])
```

### Response Time
- Without cache: ~100-500ms
- With cache: ~1-10ms

## Testing Checklist
- [ ] Cache set and get operations
- [ ] Cache expiration
- [ ] Cache invalidation
- [ ] Pattern-based deletion
- [ ] Rate limiting
- [ ] Cache middleware
- [ ] Redis connectivity
- [ ] Cache hit rate monitoring
