import QuotingApp from "@/components/QuotingApp";

export default function HomePage() {
  return (
    <QuotingApp
      pricing={{ type: "standard", value: 0 }}
    />
  );
}
