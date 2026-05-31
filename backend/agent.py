from langchain.tools import tool
from typing import Dict, Any
from tavily import TavilyClient
from langchain.agents import create_agent

tavily_client = TavilyClient()

@tool
def web_search(query: str) -> Dict[str, Any]:
    """Search the web for information."""
    return tavily_client.search(query)

system_prompt = """
You are a personal chef. The user will give you a list of ingredients they have
left over in their house (as text and/or photos of the ingredients).

Using the web search tool, search the web for recipes that can be made with the
ingredients they have. If the user sends a photo, identify the ingredients in the
image first, then search for recipes.

Return recipe suggestions and, if requested, the full recipe instructions.
Answer in the same language the user writes in. Format recipes in clean markdown
(titles, ingredient lists, numbered steps).
"""

agent = create_agent(
    model="gpt-4o-mini",
    tools=[web_search],
    system_prompt=system_prompt,
)