document.getElementById('card-form').addEventListener('submit', async function(event) {
  event.preventDefault();
  
  const description = document.getElementById('description').value;
  const template = document.getElementById('template').value;

  const response = await fetch('/generate-card', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ description, template })
  });

  if (response.ok) {
    const data = await response.json();
    document.getElementById('generated-card').src = data.imageUrl;
  } else {
    alert('Error generating card');
  }
});
