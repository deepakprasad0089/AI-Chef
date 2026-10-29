from pydantic import BaseModel, Field, ConfigDict


class RecipeRequest(BaseModel):
    ingredients: list[str] = Field(min_length=1, max_length=30)



class Substitution(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    reason: str = Field(default="", max_length=180)
    replacement: bool


class RecipeIngredient(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=100)
    quantity: float = Field(ge=0, le=10000)
    unit: str = Field(default="", max_length=40)
    substitutions: list[Substitution] = Field(
        default_factory=list,
        max_length=3
    )



class RecipeStep(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    instruction: str = Field(min_length=1, max_length=400)


class RecipeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=240)
    prep_minutes: int = Field(ge=0, le=1440)
    cook_minutes: int = Field(ge=0, le=1440)
    difficulty: str = Field(default="Easy", max_length=30)
    original_servings: int = Field(ge=1, le=12)
    ingredients: list[RecipeIngredient] = Field(min_length=1, max_length=30)
    steps: list[RecipeStep] = Field(min_length=1, max_length=15)



class InstructionRevisionRequest(BaseModel):
    recipe: RecipeResponse
    ingredient_id: str = Field(min_length=1, max_length=80)
    replacement_name: str = Field(min_length=1, max_length=100)
