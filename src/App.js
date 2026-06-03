
import './App.css';

function getTodayDate() {
  const today = new Date();
  return today.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function App() {
  return (
    <div className="app-container">
      <h2 className="date">{getTodayDate()}</h2>
      <h1 className="title">Attendance Management System</h1>
      <div className="dashboard-table-container">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Employee Name</th>
              <th>Category</th>
            </tr>
          </thead>
          <tbody>
            {/* Placeholder rows */}
            <tr>
              <td>Employee 1</td>
              <td>Category A</td>
            </tr>
            <tr>
              <td>Employee 2</td>
              <td>Category B</td>
            </tr>
            <tr>
              <td>Employee 3</td>
              <td>Category C</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;
