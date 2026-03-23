# Feature: Database Migration (Migrate dữ liệu và Schema)

## Overview
Hệ thống migration database cho Quiz App sử dụng Alembic để quản lý thay đổi schema và dữ liệu an toàn.

## File Structure

### Migration Files (Tạo trong `/backend/`)

#### 1. `/backend/alembic.ini`
**Nội dung:**
```ini
[alembic]
script_location = migrations
prepend_sys_path = .
version_path_separator = os
timezone = UTC

databases = default

[DEFAULT]
sqlalchemy.url = postgresql://user:password@localhost/quizapp
[post_write_hooks]

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

#### 2. `/backend/migrations/env.py`
**Nội dung:**
```python
import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context
import os
import sys

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import Base
from models import user, quiz, statistics  # Import all models

# this is the Alembic Config object
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Add your model's MetaData object here for 'autogenerate' support
target_metadata = Base.metadata

# Get database URL from environment
DB_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/quizapp")
config.set_main_option("sqlalchemy.url", DB_URL)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """In this scenario we need to create an Engine and associate a connection with the context."""
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = DB_URL
    
    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

#### 3. `/backend/migrations/script.py.mako`
**Nội dung:**
```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# revision identifiers, used by Alembic.
revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

#### 4. `/backend/migrations/versions/001_create_users_table.py`
**Nội dung:**
```python
"""Create users table

Revision ID: 001
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import enum

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    LIBRARIAN = "librarian"
    USER = "user"


def upgrade() -> None:
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(length=50), nullable=False),
        sa.Column('email', sa.String(length=100), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('role', sa.Enum('ADMIN', 'LIBRARIAN', 'USER', name='userrole'), nullable=False, server_default='USER'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_login', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
        sa.UniqueConstraint('username')
    )
    
    # Create indexes
    op.create_index('ix_users_username', 'users', ['username'])
    op.create_index('ix_users_email', 'users', ['email'])
    op.create_index('ix_users_role', 'users', ['role'])


def downgrade() -> None:
    op.drop_index('ix_users_role', table_name='users')
    op.drop_index('ix_users_email', table_name='users')
    op.drop_index('ix_users_username', table_name='users')
    op.drop_table('users')
    op.execute("DROP TYPE userrole")
```

#### 5. `/backend/migrations/versions/002_create_quizzes_table.py`
**Nội dung:**
```python
"""Create quizzes and questions tables

Revision ID: 002
Revises: 001
Create Date: 2024-01-02 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create quizzes table
    op.create_table(
        'quizzes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category', sa.String(length=100), nullable=False, server_default='general'),
        sa.Column('difficulty', sa.Enum('EASY', 'MEDIUM', 'HARD', name='quizdifficulty'), nullable=False, server_default='MEDIUM'),
        sa.Column('time_limit', sa.Integer(), nullable=False, server_default='30'),  # minutes
        sa.Column('total_questions', sa.Integer(), nullable=False, server_default='10'),
        sa.Column('passing_score', sa.Float(), nullable=False, server_default='60.0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('shuffle_questions', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('show_answers', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='CASCADE')
    )
    
    # Create questions table
    op.create_table(
        'questions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('quiz_id', sa.Integer(), nullable=False),
        sa.Column('question_text', sa.Text(), nullable=False),
        sa.Column('question_type', sa.Enum('MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', name='questiontype'), nullable=False, server_default='MULTIPLE_CHOICE'),
        sa.Column('options', postgresql.JSONB(), nullable=True),  # Array of options
        sa.Column('correct_answer', sa.Text(), nullable=False),
        sa.Column('explanation', sa.Text(), nullable=True),
        sa.Column('points', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['quiz_id'], ['quizzes.id'], ondelete='CASCADE')
    )
    
    # Create indexes
    op.create_index('ix_quizzes_category', 'quizzes', ['category'])
    op.create_index('ix_quizzes_difficulty', 'quizzes', ['difficulty'])
    op.create_index('ix_quizzes_created_by', 'quizzes', ['created_by'])
    op.create_index('ix_questions_quiz_id', 'questions', ['quiz_id'])


def downgrade() -> None:
    op.drop_index('ix_questions_quiz_id', table_name='questions')
    op.drop_index('ix_quizzes_created_by', table_name='quizzes')
    op.drop_index('ix_quizzes_difficulty', table_name='quizzes')
    op.drop_index('ix_quizzes_category', table_name='quizzes')
    op.drop_table('questions')
    op.drop_table('quizzes')
    op.execute("DROP TYPE questiontype")
    op.execute("DROP TYPE quizdifficulty")
```

#### 6. `/backend/migrations/versions/003_create_statistics_tables.py`
**Nội dung:**
```python
"""Create statistics tables

Revision ID: 003
Revises: 002
Create Date: 2024-01-03 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create quiz_attempts table
    op.create_table(
        'quiz_attempts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('quiz_id', sa.Integer(), nullable=False),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('total_questions', sa.Integer(), nullable=False),
        sa.Column('correct_answers', sa.Integer(), nullable=False),
        sa.Column('time_taken', sa.Integer(), nullable=False),  # seconds
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('answers', postgresql.JSONB(), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('device_info', sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['quiz_id'], ['quizzes.id'], ondelete='CASCADE')
    )
    
    # Create user_activities table
    op.create_table(
        'user_activities',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('activity_type', sa.String(length=50), nullable=False),
        sa.Column('activity_data', postgresql.JSONB(), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )
    
    # Create daily_stats table
    op.create_table(
        'daily_stats',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('total_attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_users', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('average_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('new_users', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('completed_quizzes', sa.Integer(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('date')
    )
    
    # Create indexes
    op.create_index('ix_quiz_attempts_user_id', 'quiz_attempts', ['user_id'])
    op.create_index('ix_quiz_attempts_quiz_id', 'quiz_attempts', ['quiz_id'])
    op.create_index('ix_quiz_attempts_completed_at', 'quiz_attempts', ['completed_at'])
    op.create_index('ix_user_activities_user_id', 'user_activities', ['user_id'])
    op.create_index('ix_user_activities_created_at', 'user_activities', ['created_at'])
    op.create_index('ix_daily_stats_date', 'daily_stats', ['date'])


def downgrade() -> None:
    op.drop_index('ix_daily_stats_date', table_name='daily_stats')
    op.drop_index('ix_user_activities_created_at', table_name='user_activities')
    op.drop_index('ix_user_activities_user_id', table_name='user_activities')
    op.drop_index('ix_quiz_attempts_completed_at', table_name='quiz_attempts')
    op.drop_index('ix_quiz_attempts_quiz_id', table_name='quiz_attempts')
    op.drop_index('ix_quiz_attempts_user_id', table_name='quiz_attempts')
    op.drop_table('daily_stats')
    op.drop_table('user_activities')
    op.drop_table('quiz_attempts')
```

#### 7. `/backend/migrations/versions/004_seed_initial_data.py`
**Nội dung:**
```python
"""Seed initial data

Revision ID: 004
Revises: 003
Create Date: 2024-01-04 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column
from passlib.context import CryptContext

# revision identifiers, used by Alembic.
revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def upgrade() -> None:
    # Seed admin user
    users_table = table('users',
        column('id'),
        column('username'),
        column('email'),
        column('hashed_password'),
        column('role'),
        column('is_active')
    )
    
    op.bulk_insert(users_table, [
        {
            'id': 1,
            'username': 'admin',
            'email': 'admin@quizapp.com',
            'hashed_password': pwd_context.hash('admin123'),
            'role': 'ADMIN',
            'is_active': True
        },
        {
            'id': 2,
            'username': 'librarian',
            'email': 'librarian@quizapp.com',
            'hashed_password': pwd_context.hash('librarian123'),
            'role': 'LIBRARIAN',
            'is_active': True
        }
    ])
    
    # Seed sample quiz
    quizzes_table = table('quizzes',
        column('id'),
        column('title'),
        column('description'),
        column('category'),
        column('difficulty'),
        column('time_limit'),
        column('total_questions'),
        column('passing_score'),
        column('is_active'),
        column('created_by')
    )
    
    op.bulk_insert(quizzes_table, [
        {
            'id': 1,
            'title': 'Lập trình Web cơ bản',
            'description': 'Kiểm tra kiến thức lập trình web cơ bản',
            'category': 'programming',
            'difficulty': 'MEDIUM',
            'time_limit': 30,
            'total_questions': 8,
            'passing_score': 60.0,
            'is_active': True,
            'created_by': 1
        }
    ])
    
    # Seed sample questions
    import json
    questions_table = table('questions',
        column('id'),
        column('quiz_id'),
        column('question_text'),
        column('question_type'),
        column('options'),
        column('correct_answer'),
        column('explanation'),
        column('points'),
        column('order'),
        column('is_active')
    )
    
    sample_questions = [
        {
            'id': 1,
            'quiz_id': 1,
            'question_text': 'React là thư viện của ngôn ngữ nào?',
            'question_type': 'MULTIPLE_CHOICE',
            'options': json.dumps(['Python', 'JavaScript', 'Java', 'C#']),
            'correct_answer': 'JavaScript',
            'explanation': 'React là thư viện JavaScript để xây dựng UI.',
            'points': 1.0,
            'order': 1,
            'is_active': True
        },
        {
            'id': 2,
            'quiz_id': 1,
            'question_text': 'HTML là viết tắt của gì?',
            'question_type': 'MULTIPLE_CHOICE',
            'options': json.dumps(['Hyper Text Markup Language', 'High Tech Modern Language', 'Home Tool Markup Language', 'Hyperlinks and Text Markup Language']),
            'correct_answer': 'Hyper Text Markup Language',
            'explanation': 'HTML là ngôn ngữ đánh dấu siêu văn bản.',
            'points': 1.0,
            'order': 2,
            'is_active': True
        }
    ]
    
    op.bulk_insert(questions_table, sample_questions)


def downgrade() -> None:
    # Delete seeded data
    op.execute("DELETE FROM questions WHERE id IN (1, 2)")
    op.execute("DELETE FROM quizzes WHERE id = 1")
    op.execute("DELETE FROM users WHERE id IN (1, 2)")
```

#### 8. `/backend/scripts/run_migrations.py`
**Nội dung:**
```python
#!/usr/bin/env python3
"""Script to run database migrations programmatically."""

import subprocess
import sys
import os
from pathlib import Path

def run_command(command, description):
    """Run a shell command and handle errors."""
    print(f"\n{'='*60}")
    print(f"Executing: {description}")
    print(f"Command: {command}")
    print(f"{'='*60}")
    
    try:
        result = subprocess.run(
            command,
            shell=True,
            check=True,
            capture_output=True,
            text=True
        )
        print(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error: {e}")
        print(f"stdout: {e.stdout}")
        print(f"stderr: {e.stderr}")
        return False

def main():
    # Change to backend directory
    backend_dir = Path(__file__).parent.parent
    os.chdir(backend_dir)
    
    # Check if migrations directory exists
    if not Path("migrations").exists():
        print("Initializing alembic...")
        if not run_command("alembic init migrations", "Initialize alembic"):
            sys.exit(1)
    
    # Create migration
    print("\nCreating new migration...")
    migration_message = input("Enter migration message (or press Enter for auto): ").strip()
    if migration_message:
        command = f'alembic revision --autogenerate -m "{migration_message}"'
    else:
        command = "alembic revision --autogenerate -m \"Auto migration\""
    
    run_command(command, "Create migration")
    
    # Run migration
    print("\nRunning migrations...")
    if run_command("alembic upgrade head", "Apply migrations"):
        print("\n✅ Migrations completed successfully!")
    else:
        print("\n❌ Migration failed!")
        sys.exit(1)
    
    # Show current version
    print("\nCurrent database version:")
    run_command("alembic current", "Show current version")

if __name__ == "__main__":
    main()
```

#### 9. `/backend/scripts/backup_database.py`
**Nội dung:**
```python
#!/usr/bin/env python3
"""Script to backup and restore database."""

import subprocess
import sys
import os
from datetime import datetime
from pathlib import Path

DB_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/quizapp")

class DatabaseManager:
    def __init__(self, db_url):
        self.db_url = db_url
        # Parse DB_URL to get connection info
        # Format: postgresql://user:password@host:port/dbname
        import re
        match = re.match(r'postgresql://([^:]+):([^@]+)@([^:]+):?(\d*)/(.+)', db_url)
        if match:
            self.user, self.password, self.host, port, self.dbname = match.groups()
            self.port = port if port else '5432'
        else:
            raise ValueError("Invalid database URL format")
    
    def backup(self, backup_dir="backups"):
        """Create database backup."""
        os.makedirs(backup_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = f"{backup_dir}/quizapp_backup_{timestamp}.sql"
        
        env = os.environ.copy()
        env['PGPASSWORD'] = self.password
        
        cmd = [
            'pg_dump',
            '-h', self.host,
            '-p', self.port,
            '-U', self.user,
            '-d', self.dbname,
            '-f', backup_file,
            '--verbose'
        ]
        
        print(f"Creating backup: {backup_file}")
        try:
            subprocess.run(cmd, env=env, check=True)
            print(f"✅ Backup created: {backup_file}")
            return backup_file
        except subprocess.CalledProcessError as e:
            print(f"❌ Backup failed: {e}")
            return None
    
    def restore(self, backup_file):
        """Restore database from backup."""
        if not Path(backup_file).exists():
            print(f"❌ Backup file not found: {backup_file}")
            return False
        
        env = os.environ.copy()
        env['PGPASSWORD'] = self.password
        
        cmd = [
            'psql',
            '-h', self.host,
            '-p', self.port,
            '-U', self.user,
            '-d', self.dbname,
            '-f', backup_file,
            '--verbose'
        ]
        
        print(f"Restoring from: {backup_file}")
        try:
            subprocess.run(cmd, env=env, check=True)
            print(f"✅ Database restored successfully")
            return True
        except subprocess.CalledProcessError as e:
            print(f"❌ Restore failed: {e}")
            return False

def main():
    manager = DatabaseManager(DB_URL)
    
    print("Database Management Tool")
    print("1. Create backup")
    print("2. Restore from backup")
    
    choice = input("Select option (1-2): ").strip()
    
    if choice == "1":
        manager.backup()
    elif choice == "2":
        backup_dir = "backups"
        if Path(backup_dir).exists():
            backups = sorted(Path(backup_dir).glob("*.sql"))
            if backups:
                print("\nAvailable backups:")
                for i, backup in enumerate(backups, 1):
                    print(f"{i}. {backup.name}")
                
                selection = input("\nSelect backup number: ").strip()
                try:
                    idx = int(selection) - 1
                    if 0 <= idx < len(backups):
                        manager.restore(str(backups[idx]))
                    else:
                        print("Invalid selection")
                except ValueError:
                    print("Invalid input")
            else:
                print("No backups found")
        else:
            print("No backup directory found")
    else:
        print("Invalid option")

if __name__ == "__main__":
    main()
```

## Dependencies Required

### Backend
```
alembic==1.13.0
psycopg2-binary==2.9.9
asyncpg==0.29.0
```

## Commands Reference

### Migration Commands
```bash
# Initialize alembic
cd backend
alembic init migrations

# Create new migration
alembic revision --autogenerate -m "Migration message"

# Run migrations
alembic upgrade head

# Downgrade migrations
alembic downgrade -1

# Check current version
alembic current

# Show migration history
alembic history --verbose

# Stamp database with current version (without running migrations)
alembic stamp head

# Create empty migration
alembic revision -m "Empty migration"
```

### Backup/Restore Commands
```bash
# Create backup
python scripts/backup_database.py

# Restore from backup
python scripts/backup_database.py
# Then select option 2

# Manual PostgreSQL backup
pg_dump -h localhost -U user -d quizapp > backup.sql

# Manual PostgreSQL restore
psql -h localhost -U user -d quizapp < backup.sql
```

## Testing Checklist
- [ ] Migration up/down works correctly
- [ ] Data seeding works
- [ ] Database backup works
- [ ] Database restore works
- [ ] Foreign key constraints maintained
- [ ] Index creation verified
- [ ] Enum types created correctly
- [ ] JSONB columns work properly
