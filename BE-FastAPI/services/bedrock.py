"""
Amazon Bedrock configuration shared across all LangChain chains.

Models used:
  LLM        : Amazon Nova Lite  (us.amazon.nova-lite-v1:0)
  Embeddings : Titan Text Embeddings V2  (amazon.titan-embed-text-v2:0)

AWS credentials are read from the environment (loaded from .env by main.py).
Both uppercase (AWS_ACCESS_KEY_ID) and lowercase (aws_access_key_id) key names
are supported, since the training environment uses lowercase.
"""

import os

import boto3
from botocore.config import Config
from langchain_aws import ChatBedrockConverse

DEFAULT_LLM_MODEL = "amazon.nova-lite-v1:0"
DEFAULT_REGION = "us-east-1"


class BedrockNotConfigured(RuntimeError):
    """Raised when AWS credentials are absent so callers can return a 503."""
    pass


def _env(key: str) -> str | None:
    """Try uppercase then lowercase — training .env files use lowercase keys."""
    return os.getenv(key) or os.getenv(key.lower())


def get_region() -> str:
    return _env("AWS_DEFAULT_REGION") or DEFAULT_REGION


def get_llm_model() -> str:
    return _env("BEDROCK_MODEL") or DEFAULT_LLM_MODEL


def _boto_session() -> boto3.Session:
    access_key = _env("AWS_ACCESS_KEY_ID")
    secret_key = _env("AWS_SECRET_ACCESS_KEY")
    session_token = _env("AWS_SESSION_TOKEN")

    if not access_key or not secret_key:
        raise BedrockNotConfigured(
            "AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env."
        )

    return boto3.Session(
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        aws_session_token=session_token,
        region_name=get_region(),
    )


def get_chat_model(
    *,
    max_tokens: int,
    timeout: float,
    max_retries: int = 1,
    temperature: float = 0.7,
) -> ChatBedrockConverse:
    """
    Return a ChatBedrockConverse (Nova Lite) instance ready for LangChain chains.
    Raises BedrockNotConfigured when credentials are missing.
    """
    session = _boto_session()
    config = Config(
        read_timeout=int(timeout),
        connect_timeout=30,
        retries={"max_attempts": max_retries + 1},
    )
    return ChatBedrockConverse(
        model=get_llm_model(),
        client=session.client("bedrock-runtime", config=config),
        max_tokens=max_tokens,
        temperature=temperature,
    )


def get_bedrock_client():
    """Raw boto3 bedrock-runtime client, e.g. for direct Titan embedding calls."""
    return _boto_session().client("bedrock-runtime", region_name=get_region())
