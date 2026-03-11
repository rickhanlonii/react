'use client';

const React = require('react');

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {error: null};
  }
  static getDerivedStateFromError(error) {
    return {error};
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{backgroundColor: '#fee', borderRadius: 8, padding: 12}}>
          <p style={{color: '#c00', fontWeight: 'bold', marginTop: 0, marginBottom: 4}}>
            Something went wrong
          </p>
          <p style={{color: '#900', fontSize: 13, marginTop: 0}}>
            {this.state.error.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

module.exports = ErrorBoundary;
module.exports.default = ErrorBoundary;
