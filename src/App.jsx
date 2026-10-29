import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChefHat, Sparkles, Clock3, Users, Plus, Minus, ArrowLeftRight,
  Check, AlertCircle, RefreshCw, Utensils, Leaf, CookingPot
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function formatQuantity(value) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 100) / 100;
  const whole = Math.floor(rounded);
  const fraction = rounded - whole;
  const common = [
    [0.25, "¼"], [0.33, "⅓"], [0.5, "½"], [0.67, "⅔"], [0.75, "¾"]
  ];
  const match = common.find(([n]) => Math.abs(fraction - n) < 0.035);
  if (match) return `${whole || ""}${match[1]}`;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function normalizeRecipe(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The recipe response wasn't an object.");
  }
  if (typeof data.title !== "string" || !data.title.trim()) {
    throw new Error("The recipe is missing a title. Please try again.");
  }
  if (!Array.isArray(data.ingredients) || data.ingredients.length === 0) {
    throw new Error("The recipe didn't include a valid ingredient list. Please try again.");
  }
  if (!Array.isArray(data.steps) || data.steps.length === 0) {
    throw new Error("The recipe didn't include cooking steps. Please try again.");
  }
  const ingredients = data.ingredients.map((item, index) => {
    if (!item || typeof item.name !== "string" || !item.name.trim()) {
      throw new Error("One of the ingredients is invalid. Please try again.");
    }
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new Error(`The quantity for ${item.name} is invalid. Please try again.`);
    }
    
const substitutions = Array.isArray(item.substitutions)
  ? item.substitutions
      .filter(s => s && typeof s.name === "string" && s.name.trim())
      .map((s, i) => ({
        id: `${index}-swap-${i}`,
        name: s.name,
        reason: typeof s.reason === "string" ? s.reason : "",
        replacement: s.replacement === true
      }))
  : [];

    return {
      id: String(item.id || `ingredient-${index}`),
      name: item.name,
      quantity,
      unit: typeof item.unit === "string" ? item.unit : "",
      substitutions
    };
  });
  const steps = data.steps.map((step, index) => {
    const instruction = typeof step === "string" ? step : step?.instruction;
    if (typeof instruction !== "string" || !instruction.trim()) {
      throw new Error("One of the cooking steps is invalid. Please try again.");
    }
    return { id: String(step?.id || `step-${index}`), instruction };
  });
  const servings = Number(data.original_servings ?? data.servings ?? 2);
  return {
    title: data.title.trim(),
    description: typeof data.description === "string" ? data.description : "A simple recipe made with your ingredients.",
    prep_minutes: Number.isFinite(Number(data.prep_minutes)) ? Number(data.prep_minutes) : 0,
    cook_minutes: Number.isFinite(Number(data.cook_minutes)) ? Number(data.cook_minutes) : 0,
    difficulty: typeof data.difficulty === "string" ? data.difficulty : "Easy",
    original_servings: servings > 0 ? servings : 2,
    ingredients,
    steps
  };
}

function IngredientRow({ ingredient, quantity, onSwap }) {
  return (
    <div className="ingredient-row">
      <div className="ingredient-symbol"><Leaf size={17} /></div>
      <div className="ingredient-name">{ingredient.name}</div>
      <div className="ingredient-quantity">{quantity} {ingredient.unit}</div>
      {ingredient.substitutions.length > 0 ? (
        <button className="swap-button" onClick={() => onSwap(ingredient)} type="button">
          <ArrowLeftRight size={15} /><span>Swap</span>
        </button>
      ) : <span className="no-swap" />}
    </div>
  );
}

function SwapDialog({ ingredient, onClose, onApply, loading }) {
  const [selected, setSelected] = useState(ingredient?.substitutions?.[0]?.id || "");

  // Reset the selected option whenever the user opens a different ingredient.
  useEffect(() => {
    setSelected(ingredient?.substitutions?.[0]?.id || "");
  }, [ingredient?.id, ingredient?.substitutions]);

  if (!ingredient) return null;
  const option = ingredient.substitutions.find(item => item.id === selected);

  async function handleApply() {
    if (!option || loading) return;
    const success = await onApply(ingredient.id, option);
    if (success) onClose();
  }

  function handleClose() {
    if (!loading) onClose();
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <section className="swap-dialog" role="dialog" aria-modal="true" aria-labelledby="swap-title">
        <div className="dialog-top">
          <div>
            <p className="eyebrow">INGREDIENT SWAP</p>
            <h3 id="swap-title">Replace {ingredient.name}</h3>
          </div>
          <button className="icon-button" aria-label="Close" onClick={handleClose} disabled={loading}>×</button>
        </div>
        <p className="muted">Choose an alternative suggested for this recipe.</p>
        <div className="swap-options">
          {ingredient.substitutions.map(item => (
            <label className={`swap-option ${selected === item.id ? "selected" : ""}`} key={item.id}>
              <input
                type="radio"
                name="substitution"
                value={item.id}
                checked={selected === item.id}
                disabled={loading}
                onChange={() => setSelected(item.id)}
              />
              <span className="swap-option-copy">
                <strong>{item.name}</strong>
                {item.reason && <small>{item.reason}</small>}
              </span>
            </label>
          ))}
        </div>
        <div className="dialog-actions">
          <button className="button button-secondary" onClick={handleClose} disabled={loading}>Cancel</button>
          <button className="button button-primary" disabled={!option || loading} onClick={handleApply}>
            {loading ? "Updating recipe..." : "Apply swap"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [ingredientsInput, setIngredientsInput] = useState("");
  const [recipe, setRecipe] = useState(null);
  const [servings, setServings] = useState(2);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [swaps, setSwaps] = useState({});
  const [swapIngredient, setSwapIngredient] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const requestRef = useRef(0);
  const abortRef = useRef(null);

  const completedCount = completedSteps.length;
  const progress = recipe ? Math.round(completedCount / recipe.steps.length * 100) : 0;

  const visibleIngredients = useMemo(() => {
    if (!recipe) return [];
    return recipe.ingredients.map(item => {
      const swap = swaps[item.id];
      const quantity = item.quantity * servings / recipe.original_servings;
      return {
        ...item,
        displayedName: swap?.name || item.name,
        displayedQuantity: formatQuantity(quantity)
      };
    });
  }, [recipe, servings, swaps]);

  async function generateRecipe(event) {
    event?.preventDefault();
    const ingredients = ingredientsInput.split(",").map(s => s.trim()).filter(Boolean);
    if (!ingredients.length) {
      setError("Enter at least one ingredient, separated by commas.");
      setStatusMessage("");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestRef.current;
    const timeout = setTimeout(() => controller.abort(), 45000);

    setLoading(true);
    setError("");
    setStatusMessage("");
    try {
      const response = await fetch(`${API_URL}/api/recipe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients }),
        signal: controller.signal
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.detail || "Recipe generation failed. Please try again.");
      }
      if (requestId !== requestRef.current) return;
      const nextRecipe = normalizeRecipe(body);
      setRecipe(nextRecipe);
      setServings(nextRecipe.original_servings);
      setCompletedSteps([]);
      setSwaps({});
      setStatusMessage("Your recipe is ready.");
    } catch (err) {
      if (requestId !== requestRef.current) return;
      if (err.name === "AbortError") {
        setError("The request took too long or was cancelled. Please try again.");
      } else if (err instanceof TypeError) {
        setError(`Couldn't reach the recipe service. Check that the backend is running at ${API_URL}.`);
      } else {
        setError(err.message || "Something went wrong. Please try again.");
      }
    } finally {
      clearTimeout(timeout);
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  function toggleStep(id) {
    setCompletedSteps(current => current.includes(id)
      ? current.filter(stepId => stepId !== id)
      : [...current, id]);
  }

  

async function applySwap(id, option) {
    setError("");
    setStatusMessage("");

    if (!recipe || !option?.name) {
      setError("Invalid substitution. Please try again.");
      return false;
    }

    // Direct substitution: update the displayed ingredient without regenerating steps.
    if (!option.replacement) {
      setSwaps(current => ({ ...current, [id]: option }));
      setStatusMessage(`Ingredient replaced with ${option.name}.`);
      return true;
    }

    try {
      setLoading(true);

      // Include earlier display-only swaps in the recipe sent to the backend,
      // so a later AI revision doesn't silently discard them.
      const recipeWithExistingSwaps = {
        ...recipe,
        ingredients: recipe.ingredients.map(item => {
          const previousSwap = swaps[item.id];
          return previousSwap ? { ...item, name: previousSwap.name } : item;
        }),
      };

      const response = await fetch(`${API_URL}/api/substitute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe: recipeWithExistingSwaps,
          ingredient_id: id,
          replacement_name: option.name,
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.detail || "Could not update the cooking instructions.");
      }
      if (!body?.recipe) {
        throw new Error("The updated recipe was missing from the response.");
      }

      const updatedRecipe = normalizeRecipe(body.recipe);
      setRecipe(updatedRecipe);

      // Keep the current serving count and completed steps that still exist.
      setCompletedSteps(current =>
        current.filter(stepId => updatedRecipe.steps.some(step => step.id === stepId))
      );

      // Existing simple swaps are now included in the revised recipe itself.
      setSwaps({});
      setStatusMessage(`Recipe updated with ${option.name}.`);
      return true;
    } catch (err) {
      setError(err.message || "Substitution failed. Your original recipe is unchanged.");
      return false;
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="app-shell">
      <div className="background-shape shape-one" />
      <div className="background-shape shape-two" />
      <header className="site-header page-width">
        <a className="brand" href="#" aria-label="PantryPilot home">
          <span className="brand-icon"><ChefHat size={23} strokeWidth={2.6} /></span>
          <span>PantryPilot</span>
        </a>
        {/* <span className="header-tagline">A little inspiration for your fridge</span> */}
      </header>

      <main className="page-width">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"> YOUR EVERYDAY RECIPE HELPER</p>
            <h1>Cook with what you have.</h1>
            <p className="hero-subtitle">Turn your ingredients into something delicious.</p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-circle"><Utensils size={45} /></div>
            <span className="art-dot dot-a" />
            <span className="art-dot dot-b" />
            <span className="art-dot dot-c" />
          </div>
        </section>

        <section className="input-card">
          <form onSubmit={generateRecipe}>
            <label htmlFor="ingredients" className="field-label">What's in your fridge?</label>
            <textarea
              id="ingredients"
              value={ingredientsInput}
              onChange={e => setIngredientsInput(e.target.value)}
              placeholder="e.g. eggs, tomatoes, onions, bread"
              rows={2}
              maxLength={500}
              disabled={loading}
            />
            <div className="form-bottom">
              <span className="helper-text">Separate ingredients with commas.</span>
              <button className="button button-primary generate-button" type="submit" disabled={loading}>
                {loading ? <><span className="spinner" /> Creating recipe…</> : <> Generate recipe</>}
              </button>
            </div>
          </form>
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={20} />
            <div className="error-copy"><strong>We couldn't make that recipe.</strong><span>{error}</span></div>
            <button className="button button-secondary retry-button" onClick={generateRecipe} disabled={loading}>
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        )}
        {statusMessage && !error && <p className="success-message" role="status"><Check size={16} /> {statusMessage}</p>}

        {!recipe && !loading && !error && (
          <section className="empty-state">
            <div className="empty-illustration"><ChefHat size={35} /></div>
            <h2>Your next meal starts here</h2>
            <p>Add a few ingredients above and we'll turn them into a simple recipe with steps you can follow.</p>
            <button className="example-button" onClick={() => setIngredientsInput("eggs, tomatoes, onions, bread")} type="button">
              Try an example <span>↗</span>
            </button>
          </section>
        )}

        {loading && (
        <section className="loading-card" aria-live="polite">
  <div className="boiling-pot">
    <span className="steam steam-one" />
    <span className="steam steam-two" />
    <CookingPot size={64} strokeWidth={1.5} />
  </div>

  <h2>Cooking up something delicious</h2>
  <p>Finding the right recipe for your ingredients…</p>
</section>
        )}

        {recipe && !loading && (
          <section className="recipe-workspace" aria-label="Generated recipe">
            <aside className="content-card ingredients-card workspace-ingredients">
              <div className="section-heading">
                <div><span className="section-icon"><Leaf size={18} /></span><h3>Ingredients</h3></div>
                <span className="section-caption">{recipe.ingredients.length} items</span>
              </div>
              <div className="serving-control">
                <span>Servings</span>
                <div className="stepper">
                  <button className="stepper-button" aria-label="Decrease servings" onClick={() => setServings(s => Math.max(1, s - 1))} disabled={servings <= 1}><Minus size={15} /></button>
                  <strong>{servings}</strong>
                  <button className="stepper-button stepper-plus" aria-label="Increase servings" onClick={() => setServings(s => Math.min(12, s + 1))} disabled={servings >= 12}><Plus size={15} /></button>
                </div>
              </div>
              <div className="ingredient-list">
                {visibleIngredients.map(item => (
                  <IngredientRow key={item.id} ingredient={{ ...item, name: item.displayedName }} quantity={item.displayedQuantity} onSwap={() => setSwapIngredient(item)} />
                ))}
              </div>
              {Object.keys(swaps).length > 0 && <button className="text-button undo-button" onClick={() => setSwaps({})}>Reset ingredient swaps</button>}
            </aside>

            <div className="workspace-main">
              <section className="recipe-cover">
                <img src="/food.jpg" alt="A freshly prepared meal" />
                <div className="recipe-cover-shade" />
                <div className="cover-topline"><span>PANTRYPILOT RECIPE</span><span className="difficulty-pill">{recipe.difficulty}</span></div>
                <div className="cover-copy">
                  <p className="eyebrow">MADE WITH WHAT YOU HAVE</p>
                  <h2>{recipe.title}</h2>
                  <p>{recipe.description}</p>
                </div>
                <div className="cover-meta">
                  <span><Clock3 size={16} /><strong>{recipe.prep_minutes + recipe.cook_minutes || "—"} min</strong><small>Total time</small></span>
                  <span><Users size={16} /><strong>{servings}</strong><small>{servings === 1 ? "Serving" : "Servings"}</small></span>
                </div>
              </section>

              <section className="content-card steps-card workspace-directions">
                <div className="section-heading">
                  <div><span className="section-icon"><Check size={18} /></span><h3>Directions</h3></div>
                  <span className="progress-count">{completedCount}/{recipe.steps.length} done</span>
                </div>
                <div className="progress-track" aria-label={`${progress}% complete`}><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
                <div className="steps-list">
                  {recipe.steps.map((step, index) => {
                    const checked = completedSteps.includes(step.id);
                    return <label className={`step-row ${checked ? "is-complete" : ""}`} key={step.id}>
                      <span className="step-number">{checked ? <Check size={17} /> : index + 1}</span>
                      <span className="step-text">{step.instruction}</span>
                      <input type="checkbox" checked={checked} onChange={() => toggleStep(step.id)} aria-label={`Mark step ${index + 1} complete`} />
                    </label>;
                  })}
                </div>
                {completedCount === recipe.steps.length && <div className="all-done"><Check size={17} /> All done — enjoy your meal!</div>}
              </section>
            </div>
          </section>
        )}
        <footer className="site-footer">Made for everyday cooking <span>•</span> PantryPilot AI</footer>
      </main>
      <SwapDialog
  ingredient={swapIngredient}
  onClose={() => setSwapIngredient(null)}
  onApply={applySwap}
  loading={loading}
/>
    </div>
  );
}