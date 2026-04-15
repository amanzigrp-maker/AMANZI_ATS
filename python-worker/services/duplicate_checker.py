"""
Duplicate Resume Checker
Prevents duplicate resume uploads by checking email and phone number.
"""

from typing import Dict, Any, Optional, Tuple
from loguru import logger
import re


class DuplicateChecker:
    """Check for duplicate resumes based on email and/or phone."""

    def __init__(self, db_connection):
        """
        Args:
            db_connection: Database connection object with an asyncpg pool (db.pool)
        """
        self.db = db_connection

    # -------------------------------------------------------------------------
    # Normalization helpers
    # -------------------------------------------------------------------------
    def normalize_email(self, email: Optional[str]) -> str:
        """Normalize email by stripping spaces and lowering case."""
        if not email:
            return ""
        return email.strip().lower()

    def normalize_phone(self, phone: Optional[str]) -> str:
        """Normalize phone number by removing spaces, dashes, and country code."""
        if not phone:
            return ""

        # Remove non-digits
        phone = re.sub(r"[^\d]", "", phone)

        # Handle common country code formats (+91, 91)
        if phone.startswith("91") and len(phone) == 12:
            phone = phone[2:]
        elif phone.startswith("+91") and len(phone) == 13:
            phone = phone[3:]

        return phone

    # -------------------------------------------------------------------------
    # Duplicate check core logic
    # -------------------------------------------------------------------------
    async def check_duplicate(self, email: Optional[str], phone: Optional[str]) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """
        Check if a candidate with the same email or phone already exists.

        Args:
            email (str): Candidate email
            phone (str): Candidate phone number

        Returns:
            Tuple[bool, Optional[Dict[str, Any]]]: (is_duplicate, candidate_data)
        """
        try:
            # Normalize inputs
            email_normalized = self.normalize_email(email)
            phone_normalized = self.normalize_phone(phone)

            if not email_normalized and not phone_normalized:
                logger.warning("⚠️ No email or phone provided for duplicate check")
                return False, None

            # Build dynamic WHERE clause
            conditions = []
            params = []
            # psycopg2 uses positional %s placeholders

            if email_normalized:
                params.append(email_normalized)
                conditions.append("LOWER(email) = %s")

            if phone_normalized:
                # Use LIKE to match partial or formatted numbers
                params.append(f"%{phone_normalized}%")
                conditions.append("REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE %s")

            if not conditions:
                logger.debug("No valid search condition for duplicate check.")
                return False, None

            query = f"""
                SELECT 
                    candidate_id,
                    full_name,
                    email,
                    phone,
                    created_at,
                    (
                        SELECT COUNT(*) 
                        FROM resumes 
                        WHERE candidate_id = candidates.candidate_id
                    ) AS resume_count
                FROM candidates
                WHERE {' OR '.join(conditions)}
                LIMIT 1;
            """

            # -----------------------------------------------------------------
            # Execute the query safely
            # -----------------------------------------------------------------
            if not getattr(self.db, "pool", None):
                logger.warning("⚠️ Database pool not available. Skipping duplicate check.")
                return False, None

            logger.debug(f"🧩 Duplicate check query → email={email_normalized}, phone={phone_normalized}")

            result = await self.db._run_sync(
                self.db._fetchone_sync,
                query,
                tuple(params),
            )

            # -----------------------------------------------------------------
            # Process results
            # -----------------------------------------------------------------
            if result:
                result_dict = dict(result)
                logger.warning(
                    f"🚫 Duplicate found: {result_dict.get('full_name', 'Unknown')} "
                    f"(ID: {result_dict.get('candidate_id', 'N/A')})"
                )
                logger.warning(
                    f"   Email: {result_dict.get('email', '-')}, Phone: {result_dict.get('phone', '-')}, "
                    f"Existing resumes: {result_dict.get('resume_count', 0)}"
                )

                return True, {
                    "candidate_id": result_dict.get("candidate_id"),
                    "full_name": result_dict.get("full_name"),
                    "email": result_dict.get("email"),
                    "phone": result_dict.get("phone"),
                    "created_at": result_dict.get("created_at"),
                    "resume_count": result_dict.get("resume_count"),
                }

            logger.info("✅ No duplicate found — new candidate")
            return False, None

        except Exception as e:
            # Log full traceback to diagnose real issue (DB, query, etc.)
            logger.exception(f"❌ Error checking for duplicates: {e}")
            return False, None

    # -------------------------------------------------------------------------
    # Email-only & phone-only checks
    # -------------------------------------------------------------------------
    async def check_duplicate_by_email(self, email: str) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """Check for duplicate by email only."""
        return await self.check_duplicate(email=email, phone=None)

    async def check_duplicate_by_phone(self, phone: str) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """Check for duplicate by phone only."""
        return await self.check_duplicate(email=None, phone=phone)

    # -------------------------------------------------------------------------
    # User-facing message formatter
    # -------------------------------------------------------------------------
    def format_duplicate_message(self, existing_data: Dict[str, Any]) -> str:
        """Return a user-friendly duplicate warning message."""
        message = (
            f"⚠️ Resume already exists for this candidate.\n\n"
            f"Existing Candidate Details:\n"
            f"- Name: {existing_data.get('full_name', 'N/A')}\n"
            f"- Email: {existing_data.get('email', 'N/A')}\n"
            f"- Phone: {existing_data.get('phone', 'N/A')}\n"
            f"- First uploaded: {existing_data.get('created_at', 'N/A')}\n"
            f"- Total resumes: {existing_data.get('resume_count', 0)}\n\n"
            f"Please verify if this is the same candidate or update their contact information."
        )
        return message
