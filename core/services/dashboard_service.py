import json
import logging
from datetime import datetime, timezone

from models.repository import Repository
from models.submission import Submission
from core.services.repository_service import get_academic_year

logger = logging.getLogger(__name__)

SDG_NAMES = {
    1: "No Poverty",
    2: "Zero Hunger",
    3: "Good Health & Well-being",
    4: "Quality Education",
    5: "Gender Equality",
    6: "Clean Water & Sanitation",
    7: "Affordable & Clean Energy",
    8: "Decent Work & Economic Growth",
    9: "Industry, Innovation & Infrastructure",
    10: "Reduced Inequalities",
    11: "Sustainable Cities & Communities",
    12: "Responsible Consumption & Production",
    13: "Climate Action",
    14: "Life Below Water",
    15: "Life on Land",
    16: "Peace, Justice & Strong Institutions",
    17: "Partnerships for the Goals",
}

_CACHE_KEY = "dashboard:summary"
_CACHE_TTL = 30  # seconds


async def get_dashboard_summary() -> dict:
    """
    Compute the full dashboard summary using MongoDB aggregation pipelines.
    All 17 SDGs are always present in the output, even if counts are zero.
    """
    current_academic_year = get_academic_year()

    repo_col = Repository.get_motor_collection()
    sub_col = Submission.get_motor_collection()

    # a) Per-SDG approved counts (Repository collection)
    approved_cursor = repo_col.aggregate([
        {"$unwind": "$sdg_tags"},
        {"$group": {"_id": "$sdg_tags", "count": {"$sum": 1}}},
    ])
    approved_results = await approved_cursor.to_list(length=None)

    # b) Per-SDG in-review counts (Submission collection)
    in_review_cursor = sub_col.aggregate([
        {"$match": {"status": {"$in": ["PENDING_HOD", "PENDING_COMMITTEE"]}}},
        {"$unwind": "$sdg_tags"},
        {"$group": {"_id": "$sdg_tags", "count": {"$sum": 1}}},
    ])
    in_review_results = await in_review_cursor.to_list(length=None)

    # c) Per-SDG completed this academic year (Repository collection)
    this_year_cursor = repo_col.aggregate([
        {"$match": {"academic_year": current_academic_year}},
        {"$unwind": "$sdg_tags"},
        {"$group": {"_id": "$sdg_tags", "count": {"$sum": 1}}},
    ])
    this_year_results = await this_year_cursor.to_list(length=None)

    # d) Department breakdown sorted by submission count descending
    dept_cursor = repo_col.aggregate([
        {"$group": {
            "_id": {"code": "$department_code", "name": "$department_name"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"count": -1}},
    ])
    dept_results = await dept_cursor.to_list(length=None)

    # e) Top-level totals
    total_submissions = await Submission.find().count()
    total_approved = await Repository.find().count()
    total_in_review = await Submission.find(
        {"status": {"$in": ["PENDING_HOD", "PENDING_COMMITTEE"]}}
    ).count()

    # Build lookup maps
    approved_map = {doc["_id"]: doc["count"] for doc in approved_results}
    in_review_map = {doc["_id"]: doc["count"] for doc in in_review_results}
    this_year_map = {doc["_id"]: doc["count"] for doc in this_year_results}

    sdg_breakdown = [
        {
            "sdg_number": i,
            "sdg_name": SDG_NAMES[i],
            "total_approved": approved_map.get(i, 0),
            "in_review": in_review_map.get(i, 0),
            "completed_this_year": this_year_map.get(i, 0),
        }
        for i in range(1, 18)
    ]

    department_breakdown = [
        {
            "department_code": doc["_id"]["code"],
            "department_name": doc["_id"]["name"],
            "count": doc["count"],
        }
        for doc in dept_results
    ]

    return {
        "sdg_breakdown": sdg_breakdown,
        "totals": {
            "total_submissions": total_submissions,
            "total_approved": total_approved,
            "total_in_review": total_in_review,
        },
        "department_breakdown": department_breakdown,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


async def get_cached_dashboard(redis_client=None) -> dict:
    """
    Return dashboard from Redis cache if available (TTL 30 s), otherwise compute fresh.
    Falls back to a direct DB query if Redis is unavailable.
    """
    from redis.asyncio import Redis as AsyncRedis
    from config.settings import settings

    redis = redis_client or AsyncRedis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=1)
    owned = redis_client is None
    try:
        cached = await redis.get(_CACHE_KEY)
        if cached:
            return json.loads(cached)

        summary = await get_dashboard_summary()
        await redis.setex(_CACHE_KEY, _CACHE_TTL, json.dumps(summary, default=str))
        return summary
    except Exception:
        # Redis unavailable — compute directly from DB without caching
        return await get_dashboard_summary()
    finally:
        if owned:
            try:
                await redis.aclose()
            except Exception:
                pass


async def invalidate_dashboard_cache() -> None:
    """Delete the cached dashboard so the next request recomputes fresh data."""
    from redis.asyncio import Redis as AsyncRedis
    from config.settings import settings

    redis = AsyncRedis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        await redis.delete(_CACHE_KEY)
    finally:
        await redis.aclose()
