"""
Analytics Engine — calculates progress metrics and trends for children.

Provides session-level analytics and child-level progress reports
based on historical session data.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ai_engine.db.models import Session, SessionResult, SessionStatus

logger = logging.getLogger(__name__)


@dataclass
class SessionAnalytics:
    """Analytics for a single session."""
    session_id: str
    total_score: int = 0
    accuracy: float = 0.0
    avg_reaction_time: float = 0.0
    fastest_reaction: float = 0.0
    slowest_reaction: float = 0.0
    completion_rate: float = 0.0
    total_attempts: int = 0
    correct_attempts: int = 0
    duration_seconds: int = 0


@dataclass
class ProgressReport:
    """Progress report for a child over multiple sessions."""
    child_id: str
    total_sessions: int = 0
    completed_sessions: int = 0

    # Current performance
    latest_accuracy: float = 0.0
    latest_avg_reaction_time: float = 0.0
    latest_score: int = 0

    # Averages
    avg_accuracy: float = 0.0
    avg_reaction_time: float = 0.0
    avg_score: float = 0.0

    # Trends (compared to first 3 sessions)
    accuracy_improvement: float = 0.0       # percentage points
    reaction_time_improvement: float = 0.0  # seconds (negative = faster = better)
    score_improvement: float = 0.0          # percentage

    # History (last N sessions)
    accuracy_history: list[float] = field(default_factory=list)
    reaction_time_history: list[float] = field(default_factory=list)
    score_history: list[int] = field(default_factory=list)
    session_dates: list[str] = field(default_factory=list)


class AnalyticsEngine:
    """
    Calculates session analytics and child progress reports.

    Reads from the database to compute historical trends and improvements.
    """

    @staticmethod
    def calculate_session_analytics(
        session: Session,
        results: list[SessionResult],
    ) -> SessionAnalytics:
        """
        Calculate analytics for a single completed session.

        Args:
            session: The Session ORM object.
            results: List of SessionResult ORM objects.

        Returns:
            SessionAnalytics with computed metrics.
        """
        analytics = SessionAnalytics(session_id=session.id)

        if not results:
            return analytics

        correct = [r for r in results if r.success]
        reaction_times = [r.reaction_time for r in correct if r.reaction_time and r.reaction_time > 0]

        analytics.total_score = session.total_score or 0
        analytics.total_attempts = len(results)
        analytics.correct_attempts = len(correct)
        analytics.accuracy = len(correct) / len(results) if results else 0.0
        analytics.completion_rate = 1.0 if session.status == SessionStatus.FINISHED else 0.0

        if reaction_times:
            analytics.avg_reaction_time = sum(reaction_times) / len(reaction_times)
            analytics.fastest_reaction = min(reaction_times)
            analytics.slowest_reaction = max(reaction_times)

        if session.duration:
            analytics.duration_seconds = session.duration

        return analytics

    @staticmethod
    async def calculate_child_progress(
        db: AsyncSession,
        child_id: str,
        history_limit: int = 20,
    ) -> ProgressReport:
        """
        Calculate progress report for a child based on their session history.

        Args:
            db: Async database session.
            child_id: The child's UUID.
            history_limit: Max number of recent sessions to include in history.

        Returns:
            ProgressReport with metrics, trends, and history.
        """
        report = ProgressReport(child_id=child_id)

        # Fetch completed sessions ordered by date
        result = await db.execute(
            select(Session)
            .where(
                and_(
                    Session.child_id == child_id,
                    Session.status == SessionStatus.FINISHED,
                )
            )
            .order_by(Session.finished_at.asc())
        )
        sessions = list(result.scalars().all())

        if not sessions:
            return report

        report.total_sessions = len(sessions)
        report.completed_sessions = len(sessions)

        # Build history arrays
        for s in sessions[-history_limit:]:
            report.accuracy_history.append(s.accuracy or 0.0)
            report.reaction_time_history.append(s.avg_reaction_time or 0.0)
            report.score_history.append(s.total_score or 0)
            report.session_dates.append(
                s.finished_at.strftime("%Y-%m-%d") if s.finished_at else ""
            )

        # Latest session
        latest = sessions[-1]
        report.latest_accuracy = latest.accuracy or 0.0
        report.latest_avg_reaction_time = latest.avg_reaction_time or 0.0
        report.latest_score = latest.total_score or 0

        # Overall averages
        accuracies = [s.accuracy for s in sessions if s.accuracy is not None]
        reaction_times = [s.avg_reaction_time for s in sessions if s.avg_reaction_time]
        scores = [s.total_score for s in sessions if s.total_score is not None]

        report.avg_accuracy = sum(accuracies) / len(accuracies) if accuracies else 0.0
        report.avg_reaction_time = sum(reaction_times) / len(reaction_times) if reaction_times else 0.0
        report.avg_score = sum(scores) / len(scores) if scores else 0.0

        # Trend: compare first 3 sessions vs last 3 sessions
        if len(sessions) >= 6:
            early = sessions[:3]
            recent = sessions[-3:]

            early_acc = sum(s.accuracy or 0 for s in early) / 3
            recent_acc = sum(s.accuracy or 0 for s in recent) / 3
            report.accuracy_improvement = (recent_acc - early_acc) * 100  # percentage points

            early_rt = [s.avg_reaction_time for s in early if s.avg_reaction_time]
            recent_rt = [s.avg_reaction_time for s in recent if s.avg_reaction_time]
            if early_rt and recent_rt:
                avg_early_rt = sum(early_rt) / len(early_rt)
                avg_recent_rt = sum(recent_rt) / len(recent_rt)
                report.reaction_time_improvement = avg_early_rt - avg_recent_rt  # positive = improved

            early_score = sum(s.total_score or 0 for s in early) / 3
            recent_score = sum(s.total_score or 0 for s in recent) / 3
            if early_score > 0:
                report.score_improvement = ((recent_score - early_score) / early_score) * 100

        return report
