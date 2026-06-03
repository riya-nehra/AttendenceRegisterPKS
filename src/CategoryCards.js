import { useState } from 'react';
import './CategoryCards.css';

const initialCategories = [
  {
    id: 1,
    name: 'Sarbat Da Bhala Class',
    time: '2:30 am - 5:30 am',
    people: ['eg 1', 'eg 2', 'eg 3']
  },
  // Future: Add more default categories here
];

function CategoryCards() {
  const [selectedCategory, setSelectedCategory] = useState(null);

  if (selectedCategory) {
    return (
      <div className="category-details">
        <button onClick={() => setSelectedCategory(null)}>Back</button>
        <h2>{selectedCategory.name} ({selectedCategory.time})</h2>
        <ul>
          {selectedCategory.people.map((name, i) => (
            <li key={i}>{name}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="categories">
      {initialCategories.map(cat => (
        <div key={cat.id} className="category-card" onClick={() => setSelectedCategory(cat)}>
          <h2>{cat.name}</h2>
          <p>{cat.time}</p>
        </div>
      ))}
    </div>
  );
}

export default CategoryCards;
