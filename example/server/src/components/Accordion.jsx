'use client';

const React = require('react');
const {useState} = React;

const colors = {
  text: '#1c1c1e',
  secondary: '#8e8e93',
  divider: '#c6c6c8',
  accent: '#007aff',
};

function AccordionItem({title, children, defaultOpen = false}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div>
      <div
        onClick={() => setIsOpen((o) => !o)}
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 12,
          paddingBottom: 12,
        }}>
        <p
          style={{
            color: colors.text,
            fontSize: 15,
            fontWeight: '600',
            marginTop: 0,
            marginBottom: 0,
          }}>
          {title}
        </p>
        <p
          style={{
            color: colors.accent,
            fontSize: 13,
            marginTop: 0,
            marginBottom: 0,
          }}>
          {isOpen ? 'Hide' : 'Show'}
        </p>
      </div>
      {isOpen ? (
        <div style={{paddingBottom: 12}}>
          {children}
        </div>
      ) : null}
      <div
        style={{
          height: 1,
          backgroundColor: colors.divider,
        }}
      />
    </div>
  );
}

function Accordion({items}) {
  return (
    <div>
      {items.map((item, index) => (
        <AccordionItem
          key={item.title}
          title={item.title}
          defaultOpen={index === 0}>
          {item.content}
        </AccordionItem>
      ))}
    </div>
  );
}

module.exports = Accordion;
module.exports.default = Accordion;
