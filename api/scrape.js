let inputData = input;

if (isURL(input)) {
  output.innerText = "Analyzing website... 🔍";

  const scrapeRes = await fetch('/api/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: input })
  });

  const scrapeData = await scrapeRes.json();

  if (!scrapeRes.ok) {
    output.innerText = "Failed to fetch site";
    return;
  }

  inputData = `
You are an AI sales expert.

Analyze this business:

Title: ${scrapeData.title || scrapeData.ogTitle}
Description: ${scrapeData.description}
Content: ${scrapeData.content}

Do 3 things:
1. Summarize what this business does
2. Identify their likely customer
3. Write a high-converting reply to a new lead for them
`;
}