# Feature: Database Schema Extensions (Thêm cột và bảng mới)

## Overview
Schema extensions cho Quiz App bao gồm thêm các cột mới và tạo bảng phụ trợ cho tính năng nâng cao.

## File Structure

### Migration Files (Tạo trong `/backend/migrations/versions/`)

#### 1. `/backend/migrations/versions/005_add_user_profile_columns.py`
**Nội dung:**
```python
"""Add user profile columns

Revision ID: 005
Revises: 004
Create Date: 2024-01-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add columns to users table
    op.add_column('users', sa.Column('first_name', sa.String(length=50), nullable=True))
    op.add_column('users', sa.Column('last_name', sa.String(length=50), nullable=True))
    op.add_column('users', sa.Column('avatar_url', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column('phone', sa.String(length=20), nullable=True))
    op.add_column('users', sa.Column('birth_date', sa.Date(), nullable=True))
    op.add_column('users', sa.Column('gender', sa.Enum('MALE', 'FEMALE', 'OTHER', name='gender'), nullable=True))
    op.add_column('users', sa.Column('bio', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('address', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column('city', sa.String(length=100), nullable=True))
    op.add_column('users', sa.Column('country', sa.String(length=100), nullable=True))
    op.add_column('users', sa.Column('zipcode', sa.String(length=20), nullable=True))
    op.add_column('users', sa.Column('preferences', postgresql.JSONB(), nullable=True, server_default='{}'))
    op.add_column('users', sa.Column('settings', postgresql.JSONB(), nullable=True, server_default='{}'))
    op.add_column('users', sa.Column('notification_enabled', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('users', sa.Column('email_verified', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('verification_token', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column('reset_token', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column('reset_token_expires', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('login_attempts', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True))
    
    # Create indexes
    op.create_index('ix_users_email_verified', 'users', ['email_verified'])
    op.create_index('ix_users_phone', 'users', ['phone'])


def downgrade() -> None:
    op.drop_index('ix_users_phone', table_name='users')
    op.drop_index('ix_users_email_verified', table_name='users')
    
    # Drop columns
    columns_to_drop = [
        'first_name', 'last_name', 'avatar_url', 'phone', 'birth_date', 'gender',
        'bio', 'address', 'city', 'country', 'zipcode', 'preferences', 'settings',
        'notification_enabled', 'email_verified', 'verification_token', 'reset_token',
        'reset_token_expires', 'login_attempts', 'locked_until'
    ]
    
    for column in columns_to_drop:
        op.drop_column('users', column)
    
    op.execute("DROP TYPE gender")
```

#### 2. `/backend/migrations/versions/006_add_quiz_enhancement_columns.py`
**Nội dung:**
```python
"""Add quiz enhancement columns

Revision ID: 006
Revises: 005
Create Date: 2024-01-06 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add columns to quizzes table
    op.add_column('quizzes', sa.Column('thumbnail_url', sa.String(length=255), nullable=True))
    op.add_column('quizzes', sa.Column('tags', postgresql.ARRAY(sa.String()), nullable=True, server_default='{}'))
    op.add_column('quizzes', sa.Column('metadata', postgresql.JSONB(), nullable=True, server_default='{}'))
    op.add_column('quizzes', sa.Column('instructions', sa.Text(), nullable=True))
    op.add_column('quizzes', sa.Column('start_date', sa.DateTime(timezone=True), nullable=True))
    op.add_column('quizzes', sa.Column('end_date', sa.DateTime(timezone=True), nullable=True))
    op.add_column('quizzes', sa.Column('max_attempts', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('quizzes', sa.Column('allow_review', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('quizzes', sa.Column('show_score', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('quizzes', sa.Column('show_leaderboard', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('quizzes', sa.Column('randomize_questions', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('quizzes', sa.Column('randomize_options', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('quizzes', sa.Column('negative_marking', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('quizzes', sa.Column('penalty_per_wrong', sa.Float(), nullable=False, server_default='0.0'))
    op.add_column('quizzes', sa.Column('public_access', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('quizzes', sa.Column('allowed_users', postgresql.ARRAY(sa.Integer()), nullable=True))
    op.add_column('quizzes', sa.Column('view_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('quizzes', sa.Column('rating', sa.Float(), nullable=False, server_default='0.0'))
    op.add_column('quizzes', sa.Column('rating_count', sa.Integer(), nullable=False, server_default='0'))
    
    # Add columns to questions table
    op.add_column('questions', sa.Column('media_url', sa.String(length=255), nullable=True))
    op.add_column('questions', sa.Column('media_type', sa.Enum('IMAGE', 'VIDEO', 'AUDIO', name='mediatype'), nullable=True))
    op.add_column('questions', sa.Column('difficulty', sa.Enum('EASY', 'MEDIUM', 'HARD', name='questiondifficulty'), nullable=False, server_default='MEDIUM'))
    op.add_column('questions', sa.Column('category', sa.String(length=100), nullable=True))
    op.add_column('questions', sa.Column('tags', postgresql.ARRAY(sa.String()), nullable=True))
    op.add_column('questions', sa.Column('hint', sa.Text(), nullable=True))
    op.add_column('questions', sa.Column('case_sensitive', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('questions', sa.Column('partial_credit', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('questions', sa.Column('time_limit', sa.Integer(), nullable=True))  # seconds per question
    
    # Create indexes
    op.create_index('ix_quizzes_tags', 'quizzes', ['tags'], postgresql_using='gin')
    op.create_index('ix_quizzes_start_date', 'quizzes', ['start_date'])
    op.create_index('ix_quizzes_end_date', 'quizzes', ['end_date'])
    op.create_index('ix_quizzes_public_access', 'quizzes', ['public_access'])
    op.create_index('ix_questions_category', 'questions', ['category'])
    op.create_index('ix_questions_tags', 'questions', ['tags'], postgresql_using='gin')


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_questions_tags', table_name='questions')
    op.drop_index('ix_questions_category', table_name='questions')
    op.drop_index('ix_quizzes_public_access', table_name='quizzes')
    op.drop_index('ix_quizzes_end_date', table_name='quizzes')
    op.drop_index('ix_quizzes_start_date', table_name='quizzes')
    op.drop_index('ix_quizzes_tags', table_name='quizzes')
    
    # Drop columns from questions
    question_columns = [
        'media_url', 'media_type', 'difficulty', 'category', 'tags', 'hint',
        'case_sensitive', 'partial_credit', 'time_limit'
    ]
    for column in question_columns:
        op.drop_column('questions', column)
    
    # Drop columns from quizzes
    quiz_columns = [
        'thumbnail_url', 'tags', 'metadata', 'instructions', 'start_date', 'end_date',
        'max_attempts', 'allow_review', 'show_score', 'show_leaderboard',
        'randomize_questions', 'randomize_options', 'negative_marking', 'penalty_per_wrong',
        'public_access', 'allowed_users', 'view_count', 'rating', 'rating_count'
    ]
    for column in quiz_columns:
        op.drop_column('quizzes', column)
    
    op.execute("DROP TYPE mediatype")
    op.execute("DROP TYPE questiondifficulty")
```

#### 3. `/backend/migrations/versions/007_create_quiz_ratings_table.py`
**Nội dung:**
```python
"""Create quiz ratings and comments table

Revision ID: 007
Revises: 006
Create Date: 2024-01-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create quiz_ratings table
    op.create_table(
        'quiz_ratings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('quiz_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('rating', sa.Integer(), nullable=False),  # 1-5 stars
        sa.Column('review', sa.Text(), nullable=True),
        sa.Column('is_anonymous', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['quiz_id'], ['quizzes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('quiz_id', 'user_id', name='unique_user_quiz_rating')
    )
    
    # Create quiz_comments table
    op.create_table(
        'quiz_comments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('quiz_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('parent_id', sa.Integer(), nullable=True),  # For nested comments
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('is_edited', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('like_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['quiz_id'], ['quizzes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['parent_id'], ['quiz_comments.id'], ondelete='CASCADE')
    )
    
    # Create comment_likes table
    op.create_table(
        'comment_likes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('comment_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['comment_id'], ['quiz_comments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('comment_id', 'user_id', name='unique_comment_like')
    )
    
    # Create quiz_favorites table
    op.create_table(
        'quiz_favorites',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('quiz_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['quiz_id'], ['quizzes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('quiz_id', 'user_id', name='unique_quiz_favorite')
    )
    
    # Create indexes
    op.create_index('ix_quiz_ratings_quiz_id', 'quiz_ratings', ['quiz_id'])
    op.create_index('ix_quiz_ratings_user_id', 'quiz_ratings', ['user_id'])
    op.create_index('ix_quiz_ratings_rating', 'quiz_ratings', ['rating'])
    op.create_index('ix_quiz_comments_quiz_id', 'quiz_comments', ['quiz_id'])
    op.create_index('ix_quiz_comments_user_id', 'quiz_comments', ['user_id'])
    op.create_index('ix_quiz_comments_parent_id', 'quiz_comments', ['parent_id'])
    op.create_index('ix_comment_likes_comment_id', 'comment_likes', ['comment_id'])
    op.create_index('ix_quiz_favorites_quiz_id', 'quiz_favorites', ['quiz_id'])
    op.create_index('ix_quiz_favorites_user_id', 'quiz_favorites', ['user_id'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_quiz_favorites_user_id', table_name='quiz_favorites')
    op.drop_index('ix_quiz_favorites_quiz_id', table_name='quiz_favorites')
    op.drop_index('ix_comment_likes_comment_id', table_name='comment_likes')
    op.drop_index('ix_quiz_comments_parent_id', table_name='quiz_comments')
    op.drop_index('ix_quiz_comments_user_id', table_name='quiz_comments')
    op.drop_index('ix_quiz_comments_quiz_id', table_name='quiz_comments')
    op.drop_index('ix_quiz_ratings_rating', table_name='quiz_ratings')
    op.drop_index('ix_quiz_ratings_user_id', table_name='quiz_ratings')
    op.drop_index('ix_quiz_ratings_quiz_id', table_name='quiz_ratings')
    
    # Drop tables
    op.drop_table('quiz_favorites')
    op.drop_table('comment_likes')
    op.drop_table('quiz_comments')
    op.drop_table('quiz_ratings')
```

#### 4. `/backend/migrations/versions/008_create_notifications_table.py`
**Nội dung:**
```python
"""Create notifications table

Revision ID: 008
Revises: 007
Create Date: 2024-01-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create notifications table
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.Enum('QUIZ_COMPLETE', 'NEW_QUIZ', 'RATING', 'COMMENT', 'MENTION', 'SYSTEM', name='notificationtype'), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('data', postgresql.JSONB(), nullable=True),  # Additional data
        sa.Column('action_url', sa.String(length=255), nullable=True),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_sent', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('priority', sa.Enum('LOW', 'NORMAL', 'HIGH', 'URGENT', name='notificationpriority'), nullable=False, server_default='NORMAL'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )
    
    # Create notification_settings table
    op.create_table(
        'notification_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('email_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('push_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('sms_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('quiz_reminders', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('new_quiz_alerts', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('rating_notifications', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('comment_notifications', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('system_notifications', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('digest_frequency', sa.Enum('IMMEDIATE', 'DAILY', 'WEEKLY', name='digestfrequency'), nullable=False, server_default='IMMEDIATE'),
        sa.Column('quiet_hours_start', sa.Time(), nullable=True),
        sa.Column('quiet_hours_end', sa.Time(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('user_id', name='unique_user_notification_settings')
    )
    
    # Create notification_devices table (for push notifications)
    op.create_table(
        'notification_devices',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('device_token', sa.String(length=255), nullable=False),
        sa.Column('device_type', sa.Enum('WEB', 'IOS', 'ANDROID', name='devicetype'), nullable=False),
        sa.Column('device_name', sa.String(length=100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('last_used', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )
    
    # Create indexes
    op.create_index('ix_notifications_user_id', 'notifications', ['user_id'])
    op.create_index('ix_notifications_type', 'notifications', ['type'])
    op.create_index('ix_notifications_is_read', 'notifications', ['is_read'])
    op.create_index('ix_notifications_created_at', 'notifications', ['created_at'])
    op.create_index('ix_notification_settings_user_id', 'notification_settings', ['user_id'])
    op.create_index('ix_notification_devices_user_id', 'notification_devices', ['user_id'])
    op.create_index('ix_notification_devices_token', 'notification_devices', ['device_token'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_notification_devices_token', table_name='notification_devices')
    op.drop_index('ix_notification_devices_user_id', table_name='notification_devices')
    op.drop_index('ix_notification_settings_user_id', table_name='notification_settings')
    op.drop_index('ix_notifications_created_at', table_name='notifications')
    op.drop_index('ix_notifications_is_read', table_name='notifications')
    op.drop_index('ix_notifications_type', table_name='notifications')
    op.drop_index('ix_notifications_user_id', table_name='notifications')
    
    # Drop tables
    op.drop_table('notification_devices')
    op.drop_table('notification_settings')
    op.drop_table('notifications')
    
    # Drop enum types
    op.execute("DROP TYPE devicetype")
    op.execute("DROP TYPE digestfrequency")
    op.execute("DROP TYPE notificationpriority")
    op.execute("DROP TYPE notificationtype")
```

#### 5. `/backend/migrations/versions/009_create_groups_table.py`
**Nội dung:**
```python
"""Create groups and permissions table

Revision ID: 009
Revises: 008
Create Date: 2024-01-09 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '009'
down_revision = '008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create permissions table
    op.create_table(
        'permissions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('code', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('resource', sa.String(length=50), nullable=False),  # 'quiz', 'user', 'report'
        sa.Column('action', sa.String(length=50), nullable=False),  # 'create', 'read', 'update', 'delete'
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code', name='unique_permission_code')
    )
    
    # Create groups table
    op.create_table(
        'groups',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.UniqueConstraint('name', name='unique_group_name')
    )
    
    # Create group_permissions junction table
    op.create_table(
        'group_permissions',
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('permission_id', sa.Integer(), nullable=False),
        sa.Column('granted_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('group_id', 'permission_id'),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['permission_id'], ['permissions.id'], ondelete='CASCADE')
    )
    
    # Create user_groups junction table
    op.create_table(
        'user_groups',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('added_by', sa.Integer(), nullable=True),
        sa.Column('added_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('user_id', 'group_id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['added_by'], ['users.id'], ondelete='SET NULL')
    )
    
    # Create user_permissions table (for direct permissions)
    op.create_table(
        'user_permissions',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('permission_id', sa.Integer(), nullable=False),
        sa.Column('granted_by', sa.Integer(), nullable=True),
        sa.Column('granted_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('user_id', 'permission_id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['permission_id'], ['permissions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['granted_by'], ['users.id'], ondelete='SET NULL')
    )
    
    # Create indexes
    op.create_index('ix_permissions_code', 'permissions', ['code'])
    op.create_index('ix_permissions_resource', 'permissions', ['resource'])
    op.create_index('ix_groups_name', 'groups', ['name'])


def downgrade() -> None:
    op.drop_index('ix_groups_name', table_name='groups')
    op.drop_index('ix_permissions_resource', table_name='permissions')
    op.drop_index('ix_permissions_code', table_name='permissions')
    
    op.drop_table('user_permissions')
    op.drop_table('user_groups')
    op.drop_table('group_permissions')
    op.drop_table('groups')
    op.drop_table('permissions')
```

#### 6. `/backend/scripts/seed_permissions.py`
**Nội dung:**
```python
#!/usr/bin/env python3
"""Seed default permissions and groups."""

from sqlalchemy.orm import Session
from database import SessionLocal
from models import Permission, Group

def seed_permissions():
    db = SessionLocal()
    
    try:
        # Define default permissions
        permissions = [
            # Quiz permissions
            {"name": "Create Quiz", "code": "quiz:create", "resource": "quiz", "action": "create", "description": "Create new quizzes"},
            {"name": "Read Quiz", "code": "quiz:read", "resource": "quiz", "action": "read", "description": "View quizzes"},
            {"name": "Update Quiz", "code": "quiz:update", "resource": "quiz", "action": "update", "description": "Edit quizzes"},
            {"name": "Delete Quiz", "code": "quiz:delete", "resource": "quiz", "action": "delete", "description": "Delete quizzes"},
            
            # User permissions
            {"name": "Create User", "code": "user:create", "resource": "user", "action": "create", "description": "Create new users"},
            {"name": "Read User", "code": "user:read", "resource": "user", "action": "read", "description": "View user profiles"},
            {"name": "Update User", "code": "user:update", "resource": "user", "action": "update", "description": "Edit user profiles"},
            {"name": "Delete User", "code": "user:delete", "resource": "user", "action": "delete", "description": "Delete users"},
            
            # Report permissions
            {"name": "View Reports", "code": "report:read", "resource": "report", "action": "read", "description": "View statistics and reports"},
            {"name": "Export Reports", "code": "report:export", "resource": "report", "action": "export", "description": "Export reports"},
        ]
        
        # Create permissions
        for perm_data in permissions:
            existing = db.query(Permission).filter_by(code=perm_data["code"]).first()
            if not existing:
                perm = Permission(**perm_data)
                db.add(perm)
        
        db.commit()
        
        # Create default groups
        groups = [
            {
                "name": "System Administrators",
                "description": "Full system access",
                "is_system": True,
                "permissions": [p["code"] for p in permissions]
            },
            {
                "name": "Content Managers",
                "description": "Manage quizzes and content",
                "is_system": True,
                "permissions": ["quiz:create", "quiz:read", "quiz:update", "quiz:delete", "report:read"]
            },
            {
                "name": "Standard Users",
                "description": "Regular quiz takers",
                "is_system": True,
                "permissions": ["quiz:read", "user:read", "user:update"]
            }
        ]
        
        for group_data in groups:
            perm_codes = group_data.pop("permissions")
            existing = db.query(Group).filter_by(name=group_data["name"]).first()
            
            if not existing:
                group = Group(**group_data)
                db.add(group)
                db.commit()
                
                # Add permissions to group
                for code in perm_codes:
                    perm = db.query(Permission).filter_by(code=code).first()
                    if perm:
                        group.permissions.append(perm)
                
                db.commit()
        
        print("✅ Permissions and groups seeded successfully!")
        
    except Exception as e:
        print(f"❌ Error seeding permissions: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_permissions()
```

## Schema Summary

### New Tables Added
| Table | Purpose |
|-------|---------|
| quiz_ratings | User ratings for quizzes |
| quiz_comments | Comments on quizzes |
| comment_likes | Likes on comments |
| quiz_favorites | User favorite quizzes |
| notifications | User notifications |
| notification_settings | User notification preferences |
| notification_devices | Push notification devices |
| permissions | System permissions |
| groups | User groups |
| group_permissions | Group-permission mapping |
| user_groups | User-group membership |
| user_permissions | Direct user permissions |

### Enhanced Tables
| Table | New Columns |
|-------|-------------|
| users | profile fields, security fields, preferences |
| quizzes | metadata, scheduling, scoring options |
| questions | media support, difficulty, hints |

## Testing Checklist
- [ ] All migrations run successfully
- [ ] Foreign key constraints work
- [ ] Indexes improve query performance
- [ ] JSONB columns handle data correctly
- [ ] Enum types work as expected
- [ ] Default values set correctly
- [ ] Unique constraints prevent duplicates
- [ ] Cascade deletes work properly
