"""Public catalog changes are tested on isolated snapshots, not production."""
import unittest
from itertools import count
from erp.application.commands import mutate
from erp.application.queries import visible
from erp.modules.catalog.application import Catalog
from erp.infrastructure.persistence import empty_state


class WebContentTests(unittest.TestCase):
    def setUp(self):
        self.state=empty_state()
        self.ids=count()
    def command(self,role,action,**data):
        return mutate(self.state,dict(id='test',role=role,branch=None),action,
                      dict(branch='Potosí',**data),
                      now=lambda:'2026-10-24T11:00:00-04:00',
                      today=lambda:'2026-10-24',uid=lambda:str(next(self.ids)),
                      branches=['Potosí','Sucre'],biometric_reader=None)
    def catalog(self,branch):
        class Repository:
            def read(inner):return self.state
        return Catalog(Repository(),['Potosí','Sucre'],lambda:'2026-10-24').catalog(branch)
    def test_accounting_only_publishes_combos(self):
        payload=dict(title='Combo',description='Pipocas y bebida',price=35,position=1,published='yes')
        with self.assertRaises(ValueError):
            self.command('administrator','combo_save',**payload)
        combo=self.command('accounting','combo_save',**payload)['combo']
        self.assertEqual(self.catalog('Potosí')['combos'][0]['price'],35)
        self.assertEqual(self.catalog('Sucre')['combos'],[])
        self.assertNotIn('editor',self.catalog('Potosí')['combos'][0])
        self.command('accounting','combo_save',id=combo,**dict(payload,published='no'))
        self.assertEqual(self.catalog('Potosí')['combos'],[])
        self.command('accounting','combo_delete',id=combo)
    def test_manager_only_socials_and_no_javascript_urls(self):
        data=dict(facebookUrl='https://www.facebook.com/micine',facebookPublished='yes',
                  tiktokUrl='https://www.tiktok.com/@micine',tiktokPublished='no')
        with self.assertRaises(ValueError):
            self.command('accounting','social_links_save',**data)
        self.command('manager','social_links_save',**data)
        self.assertEqual(self.catalog('Potosí')['socialLinks'],[dict(platform='facebook',url='https://www.facebook.com/micine')])
        with self.assertRaises(ValueError):
            self.command('manager','social_links_save',**dict(data,facebookUrl='javascript:alert(1)'))
        self.assertEqual(len(self.catalog('Potosí')['socialLinks']),1)
    def test_existing_account_and_payroll_security_remains(self):
        self.state['staffAccounts']=[dict(branch='Potosí',id='private',passwordHash='secret')]
        data=visible(self.state,dict(id='admin',role='administrator',branch='Potosí'),users={},mail_configured=False)
        self.assertNotIn('staffAccounts',data)
        self.assertNotIn('webSocialLinks',data)
        self.assertNotIn('webCombos',data)


if __name__=='__main__':unittest.main()
