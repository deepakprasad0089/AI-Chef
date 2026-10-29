# Pantry Pilot

**Cook with what you have.** Pantry Pilot turns the ingredients in your kitchen into a practical recipe, then lets you adjust the recipe when you swap ingredients.

## Features

- **AI-generated recipes:** Enter the ingredients you have and get a recipe with quantities, preparation/cooking times, and step-by-step instructions.
- **Ingredient substitutions:** See suggested alternatives based on the ingredients you entered.
- **Recipe-aware swaps:** When a swap changes how a dish should be prepared, the AI can revise the recipe title, description, ingredients, and cooking steps.
- **Interactive cooking checklist:** Check off steps as you cook.
- **Adjustable servings:** Scale ingredient quantities for the number of servings you need.

## Tech stack

- **Frontend:** React, Vite, JavaScript, CSS
- **Backend:** Python, FastAPI, Pydantic
- **AI:** Google Gemini API (`google-genai`)
- **Configuration:** `python-dotenv`
- **API communication:** Fetch / JSON over HTTP

## Project structure

The commands below assume a layout similar to this:

```text
pantry-pilot/
├── frontend/              # React + Vite application
│   ├── src/
│   ├── package.json
│   └── .env                # Optional frontend environment variables
└── backend/
    ├── main.py             # FastAPI app and recipe endpoints
    ├── schemas.py          # Pydantic request/response models
    └── .env                # Gemini API key
```

If your folders are named differently, run the commands from the corresponding frontend and backend directories.

## Requirements

- Python 3.10+
- Node.js and npm
- A Google Gemini API key

## Local setup

### 1. Get the project

```bash
git clone https://github.com/deepakprasad0089/AI-Chef.git
cd AI-Chef
```

### 2. Configure the backend

Open a terminal in the backend directory:

```bash
cd backend
python -m venv venv
```

Activate the virtual environment.

**Windows PowerShell**
```powershell
.\venv\Scripts\Activate.ps1
```

**macOS / Linux**
```bash
source venv/bin/activate
```

Install the backend dependencies:

```bash
pip install -r requirements.txt
```

Create a `.env` file in the backend directory:

```env
GEMINI_API_KEY=your_gemini_api_key
```

Keep this key private. Do not commit `.env` to Git.

Start the API:

```bash
uvicorn main:app --reload
```

The API should be available at `http://127.0.0.1:8000`. Interactive API documentation is available at `http://127.0.0.1:8000/docs`.

> If the project already includes a `requirements.txt`, prefer `pip install -r requirements.txt` so the installed packages match the project.

### 3. Configure the frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Vite prints the local frontend URL in the terminal, commonly `http://localhost:5173`.

If your frontend uses a configurable backend URL, set it in the frontend `.env` file using the variable name expected by the code (for example, `VITE_API_URL=http://127.0.0.1:8000`). Do not add a frontend environment variable unless the application reads it.

## How to use

1. Start the backend and frontend.
2. Open the frontend URL shown by Vite.
3. Enter the ingredients currently available in your kitchen.
4. Generate a recipe and review the ingredients, quantities, timing, and instructions.
5. Choose a suggested substitution for an ingredient.
6. Apply the swap. If it changes the dish or cooking method, Pantry Pilot asks the AI to revise the recipe instead of only changing the ingredient label.
7. Check off cooking steps as you complete them.
8. Change the serving count to scale ingredient quantities.

**Demo example:** Enter pasta, tomatoes, mushrooms, milk, yogurt, spinach, and cheese. Generate a recipe, then try replacing mushrooms with spinach or milk with yogurt. Review the updated title and instructions after each recipe-aware swap.

## API overview

The backend exposes these endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Check whether the API is running. |
| `POST` | `/api/recipe` | Generate a recipe from the supplied ingredients. |
| `POST` | `/api/substitute` | Apply an allowed ingredient swap and revise the recipe instructions when needed. |

You can inspect request and response schemas and try the endpoints through FastAPI's Swagger UI at `/docs`.

### Example: generate a recipe

`POST /api/recipe`

```json
{
  "ingredients": [
    "pasta",
    "tomatoes",
    "mushrooms",
    "milk",
    "yogurt",
    "spinach",
    "cheese"
  ]
}
```

### Example: apply a recipe-aware swap

`POST /api/substitute`

The request contains the current recipe, the ID of the ingredient being changed, and the selected replacement:

```json
{
  "recipe": {
    "...": "send the full recipe object returned by /api/recipe"
  },
  "ingredient_id": "ingredient-id-from-the-recipe",
  "replacement_name": "spinach"
}
```

Use the actual ingredient ID and the complete recipe object returned by the API; the ellipsis above is explanatory and is not valid request data.

## AI usage note

Pantry Pilot integrates the **Google Gemini API** to generate recipes from user-provided ingredients and suggest suitable substitutions. When an ingredient is replaced, the backend evaluates the change and revises the recipe's title, description, ingredient list, and cooking instructions when necessary.

The backend uses structured prompts to request JSON responses and Pydantic models to validate the returned data before sending it to the frontend. Substitution requests include the existing recipe and selected ingredient replacement, allowing the AI to make recipe-aware adjustments rather than simply replacing an ingredient name.

AI assistance was also used during development to refine prompts, review implementation logic, debug issues, and prepare documentation.

## Limitations and assumptions

- **AI output can be wrong.** Recipe quantities, cooking times, food-safety advice, and substitutions may be inaccurate. Review the result and use your judgment before cooking.
- **Substitutions depend on the provided ingredient list.** Pantry Pilot is designed to prioritize ingredients entered by the user; it should not imply that an unlisted replacement is available.
- **Not every swap is equivalent.** A replacement can change texture, flavor, cooking time, or the final dish. Review revised steps before continuing.
- **No inventory verification.** The app does not physically verify what is in the kitchen or whether an entered ingredient is still usable.
- **External AI dependency.** Recipe generation and AI-assisted revisions require network access and a valid Gemini API key. Provider quotas, latency, or service outages may affect requests.
- **No nutrition or allergy guarantee.** The app does not replace professional dietary advice and does not guarantee allergen-free recipes.
- **Local development setup.** The commands in this README assume the folder structure shown above; adjust paths if your repository differs.

## Time spent

**Development time: approximately 5 hours.** 

## Future improvements

- Add automated tests for API validation, substitution rules, and recipe revisions.
- Improve error messages for API-key, quota, and network failures.
- Add dietary preferences, allergy filters, and more explicit food-safety checks.
- Deploy the frontend and backend and document the live demo URL.


