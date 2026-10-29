import json
import os
import re
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from pydantic import ValidationError

from schemas import RecipeRequest, RecipeResponse

load_dotenv()

app = FastAPI(title="AIChef API", version="1.0.0")

frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin, "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def extract_json(text: str) -> Any:
    """Parse JSON only; tolerate accidental Markdown fences, but not arbitrary prose."""
    if not text or not text.strip():
        raise ValueError("The AI returned an empty response.")
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


@app.post("/api/recipe", response_model=RecipeResponse)
def create_recipe(request: RecipeRequest) -> RecipeResponse:
    ingredients = [item.strip() for item in request.ingredients if item.strip()]
    if not ingredients:
        raise HTTPException(status_code=422, detail="Enter at least one ingredient.")
    if len(ingredients) > 30:
        raise HTTPException(status_code=422, detail="Please enter 30 ingredients or fewer.")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="The AI service isn't configured yet. Add GEMINI_API_KEY to backend/.env.",
        )

    prompt = f"""
Create one practical recipe using these ingredients where possible:
{json.dumps(ingredients, ensure_ascii=False)}

Return ONLY a JSON object with exactly these fields:
{{
  "title": "Recipe title",
  "description": "One short sentence",
  "prep_minutes": 10,
  "cook_minutes": 15,
  "difficulty": "Easy",
  "original_servings": 2,
  "ingredients": [
    {{
      "id": "stable-short-id",
      "name": "Ingredient name",
      "quantity": 1,
      "unit": "piece",
      "substitutions": [
        {{"name": "Alternative", "reason": "Short practical reason"}}
      ]
    }}
  ],
  "steps": [
    {{"id": "step-1", "instruction": "One clear cooking instruction"}}
  ]
}}

Rules:
- Include 3 to 10 practical cooking steps.
- Use numeric quantities and short units.
- Provide 0 to 3 reasonable substitutions per ingredient.
- Do not invent medical, nutrition, or allergy guarantees.
- Avoid ingredients not listed unless they are common basics such as water, salt, or cooking oil.
- Keep recipe instructions concise and sensible.
- No Markdown fences and no extra keys.
"""

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.4,
            ),
        )
        parsed = extract_json(response.text or "")
        return RecipeResponse.model_validate(parsed)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail="The AI returned invalid recipe data. Please try again.",
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except ValidationError:
        raise HTTPException(
            status_code=502,
            detail="The AI response was missing required recipe fields. Please try again.",
        )
    except HTTPException:
        raise
    except Exception:
        # Avoid returning provider details, request data, or secrets to the browser.
        raise HTTPException(
            status_code=502,
            detail="Recipe generation is temporarily unavailable. Please try again.",
        )
