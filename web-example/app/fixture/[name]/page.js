import {notFound} from 'next/navigation';
import {getFixtureComponent} from '../../../lib/fixtures';

export default async function FixturePage({params}) {
  var {name} = await params;
  var Fixture = getFixtureComponent(name);
  if (!Fixture) {
    notFound();
  }
  return <Fixture />;
}
