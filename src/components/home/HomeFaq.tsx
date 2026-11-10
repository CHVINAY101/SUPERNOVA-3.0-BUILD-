import { useState } from "react";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export const HomeFaq = () => {
  const [openId, setOpenId] = useState<string | null>("faq-1");

  const faqs: FaqItem[] = [
    {
      id: "faq-1",
      question: "General event information",
      answer: "SUPERNOVA 3.0 is an Educational Innovation Expo on 20–21 November 2026, organised by The National Education Society of Karnataka with the Department of Animation.",
    },
    {
      id: "faq-2",
      question: "Event participation",
      answer: "Registration is open for participants, visitors and esports teams. Use the Register page.",
    },
    {
      id: "faq-3",
      question: "Esports registration",
      answer: "Details coming soon.",
    },
    {
      id: "faq-4",
      question: "Venue and timings",
      answer: "The National College, Basavanagudi, Bengaluru – 04. Timings: TBA.",
    },
    {
      id: "faq-5",
      question: "Contact information",
      answer: "Helpdesk: animationthenationalcollege@gmail.com",
    },
  ];

  const toggleFaq = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <section className="section-padding bg-white">
      <div className="site-container max-w-4xl mx-auto">
        <div className="flex flex-col items-center text-center mb-16">
          <span className="section-label">FREQUENTLY ASKED QUESTIONS</span>
          <h2 className="section-heading">Frequently Asked Questions</h2>
        </div>

        {/* Accordion List */}
        <div className="divide-y divide-[#EAEAF2] border-y border-[#EAEAF2]">
          {faqs.map((faq) => {
            const isOpen = openId === faq.id;
            return (
              <div key={faq.id} className="faq-item">
                <button
                  type="button"
                  onClick={() => toggleFaq(faq.id)}
                  aria-expanded={isOpen}
                  className="faq-header"
                >
                  <span className="pr-4">{faq.question}</span>
                  <span
                    className="flex-shrink-0 w-8 h-8 rounded-full border border-[#EAEAF2] flex items-center justify-center text-lg transition-transform"
                    style={{
                      transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
                      backgroundColor: isOpen ? "#1719C9" : "#F8F7FC",
                      color: isOpen ? "#FFFFFF" : "#151535",
                      borderColor: isOpen ? "#1719C9" : "#EAEAF2",
                    }}
                  >
                    +
                  </span>
                </button>

                {isOpen && (
                  <div className="faq-content">
                    <p>{faq.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
