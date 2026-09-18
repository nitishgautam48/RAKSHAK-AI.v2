from pydantic import BaseModel, Field


class NlpAnalyzeRequest(BaseModel):
    text: str = Field(min_length=1)


class AssessRequest(BaseModel):
    narrative: str = Field(min_length=1, description="Victim narrative / transcript text to analyze")
    language_hint: str | None = None
    prior_escalations: int = 0
    audio_base64: str | None = Field(default=None, description="Optional base64-encoded audio for voice analysis")


class ContributionOut(BaseModel):
    label: str
    rawValue: float
    weight: float
    contributionPct: float
    direction: str


class AssessResponse(BaseModel):
    modelVersions: dict[str, str]
    transcript: dict
    voice: dict | None
    nlp: dict
    emotion: dict
    svi: dict
    recommendations: list[dict]
    explanation: dict
    latencyMs: int
