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

from schemas import InstructionRevisionRequest, RecipeRequest, RecipeResponse

load_dotenv()

app = FastAPI(title="PantryPilot API", version="1.0.0")

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
    """Parse JSON only; tolerate accidental Markdown fences."""
    if not text or not text.strip():
        raise ValueError("The AI returned an empty response.")

    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


def get_gemini_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="The AI service isn't configured. Add GEMINI_API_KEY to backend/.env.",
        )
    return genai.Client(api_key=api_key)


@app.post("/api/recipe", response_model=RecipeResponse)
def create_recipe(request: RecipeRequest) -> RecipeResponse:
    ingredients = [item.strip() for item in request.ingredients if item.strip()]
    if not ingredients:
        raise HTTPException(status_code=422, detail="Enter at least one ingredient.")
    if len(ingredients) > 30:
        raise HTTPException(status_code=422, detail="Please enter 30 ingredients or fewer.")

    prompt = f"""
Create one practical recipe using the user's available ingredients.
The complete list of ingredients the user says they have is:
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
      "name": "Ingredient used in this recipe",
      "quantity": 1,
      "unit": "piece",
      "substitutions": [
        {{
          "name": "Alternative from the user's list",
          "reason": "Short practical reason",
          "replacement": false
        }}
      ]
    }}
  ],
  "steps": [
    {{
      "id": "step-1",
      "instruction": "One clear cooking instruction"
    }}
  ]
}}

Ingredient rules:
- Prefer ingredients from the user's list.
- Do not claim the user has an ingredient unless it appears in the list.
- Common basics such as water, salt, or cooking oil may be used only as optional pantry staples; never present them as confirmed available ingredients unless listed.
- Use only sensible quantities and practical cooking methods.

Substitution rules:
- Suggest alternatives only from the user's provided ingredient list.
- Do not suggest ingredients the user did not list, including pantry staples, as substitutions.
- Do not suggest an ingredient as its own substitute.
- Only offer alternatives that are genuinely suitable for this specific recipe.
- An alternative may be another ingredient already used in the recipe only when swapping it is still practical.
- Return an empty substitutions list when no suitable alternative exists.
- Set replacement=false only when the current cooking instructions remain valid after the swap.
- Set replacement=true when any cooking step, timing, order, or technique needs to change.
- Suggest no more than 3 alternatives per recipe ingredient.

Recipe rules:
- Include 3 to 10 practical cooking steps.
- Use numeric quantities and short units.
- Keep instructions concise and sensible.
- Do not make medical, nutrition, or allergy guarantees.
- Do not return Markdown fences or extra keys.
"""

    try:
        client = get_gemini_client()
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
    except HTTPException:
        raise
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail="The AI returned invalid recipe data. Please try again.",
        )
    except (ValueError, ValidationError):
        raise HTTPException(
            status_code=502,
            detail="The AI response was missing valid recipe fields. Please try again.",
        )
    except Exception:
        # Avoid returning provider details, request data, or secrets to the browser.
        raise HTTPException(
            status_code=502,
            detail="Recipe generation is temporarily unavailable. Please try again.",
        )


@app.post("/api/substitute")
def revise_substitution(request: InstructionRevisionRequest) -> dict[str, Any]:
    recipe = request.recipe.model_dump()

    selected_ingredient = next(
        (
            item
            for item in recipe["ingredients"]
            if item["id"] == request.ingredient_id
        ),
        None,
    )
    if selected_ingredient is None:
        raise HTTPException(status_code=404, detail="Ingredient not found in the recipe.")

    original_name = selected_ingredient["name"]
    replacement_name = request.replacement_name.strip()
    if not replacement_name:
        raise HTTPException(status_code=422, detail="Choose a valid replacement ingredient.")

    # Only allow a replacement that the recipe itself offered for this ingredient.
    allowed_replacements = {
        substitution.name.casefold()
        for substitution in request.recipe.ingredients[
            next(
                index
                for index, item in enumerate(request.recipe.ingredients)
                if item.id == request.ingredient_id
            )
        ].substitutions
    }
    if replacement_name.casefold() not in allowed_replacements:
        raise HTTPException(
            status_code=422,
            detail="Choose a suggested replacement for this ingredient.",
        )

    if replacement_name.casefold() == original_name.casefold():
        raise HTTPException(
            status_code=422,
            detail="The replacement must be different from the original ingredient.",
        )

    try:
        client = get_gemini_client()
        
        prompt = f"""
Revise this recipe after the selected ingredient substitution.

Current recipe JSON:
{json.dumps(recipe, ensure_ascii=False)}

Original ingredient: {original_name}
Replacement ingredient: {replacement_name}

Requirements:
- Replace the selected ingredient with the replacement ingredient.
- Update the recipe title and description to reflect the resulting dish.
- If the title mentions the removed ingredient, update it when appropriate.
  Example: "Creamy Mushroom Pasta" may become "Creamy Tomato Pasta"
  when mushrooms are replaced with tomatoes.
- Do not blindly replace words in the title. Choose a natural title that
  accurately describes the final recipe.
- Update all cooking steps affected by the substitution.
- Keep unrelated steps unchanged where possible.
- Preserve prep/cook times, difficulty, servings, and unrelated ingredients.
- Keep the replacement quantity and unit practical for this recipe.
- Do not introduce new ingredients.
- Keep existing step IDs where possible and ensure all IDs are unique.
- Return ONLY JSON in this format:
{{
  "title": "Updated recipe title",
  "description": "Updated recipe description",
  "steps": [
    {{
      "id": "step-1",
      "instruction": "Updated cooking instruction"
    }}
  ]
}}
"""

        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )
        parsed = extract_json(response.text or "")
        steps = parsed.get("steps") if isinstance(parsed, dict) else None

        if not isinstance(steps, list) or not 1 <= len(steps) <= 15:
            raise ValueError("The AI returned an invalid list of cooking steps.")

        validated_steps = []
        seen_ids = set()
        for index, step in enumerate(steps):
            if not isinstance(step, dict):
                raise ValueError("The AI returned an invalid cooking step.")

            step_id = step.get("id")
            instruction = step.get("instruction")

            if (
                not isinstance(step_id, str)
                or not step_id.strip()
                or len(step_id) > 80
                or not isinstance(instruction, str)
                or not instruction.strip()
                or len(instruction) > 400
            ):
                raise ValueError("The AI returned an invalid cooking instruction.")

            # Ensure React step IDs remain unique after the model revises them.
            if step_id in seen_ids:
                step_id = f"revised-step-{index + 1}"
            seen_ids.add(step_id)

            validated_steps.append(
                {"id": step_id, "instruction": instruction.strip()}
            )

        updated_recipe = {
            **recipe,
            "ingredients": [
                {
                    **item,
                    "name": replacement_name,
                    # The replacement has been applied. Avoid offering the same
                    # old options against this newly selected ingredient.
                    "substitutions": [],
                }
                if item["id"] == request.ingredient_id
                else item
                for item in recipe["ingredients"]
            ],
            "steps": validated_steps,
        }

        validated_recipe = RecipeResponse.model_validate(updated_recipe)
        return {"recipe": validated_recipe.model_dump()}

    except HTTPException:
        raise
    except (json.JSONDecodeError, ValueError, ValidationError):
        raise HTTPException(
            status_code=502,
            detail="The revised recipe was invalid. Please try again.",
        )
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Could not revise the recipe. Please try again.",
        )
